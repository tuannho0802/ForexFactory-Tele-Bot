# 📡 Forex News Telegram Bot — Kế Hoạch Toàn Diện

---

## 1. Phân Tích & Nhận Định Plan Cũ

|Hạng mục|Trạng thái|Vấn đề cụ thể|
|---|---|---|
|Kiến trúc tổng thể|✅ Ổn|Phù hợp với yêu cầu|
|Schema DB|⚠️ Thiếu|Chưa có index, chưa xử lý timezone đúng|
|Scraping strategy|❌ Yếu|Không có fallback, proxy, hay circuit breaker|
|Cron Jobs|⚠️ Rủi ro|Serverless cron có thể chạy trùng (double execution)|
|Telegram rate limit|❌ Thiếu|Không có queue gửi tin, dễ bị 429|
|Logic phát hiện tin mới|⚠️ Mơ hồ|Chưa rõ hash key, chưa xử lý trường hợp update actual|
|NestJS trên Vercel|⚠️ Phức tạp|Cold start chậm, timeout nguy hiểm cho scraping|
|Monitoring & Alerting|❌ Thiếu|Chỉ đề cập sơ qua|
|Testing strategy|❌ Không có|Không có unit test, integration test|
|Security|❌ Không có|Webhook verification, cron auth chưa đề cập|

---

## 2. Kiến Trúc Đề Xuất (Cải Tiến)

```
[Telegram Users]
      |
      | Webhook (HTTPS + Secret Token verification)
      ↓
[NestJS on Vercel — Serverless Functions]
      |
      ├── /webhook/telegram     → Xử lý commands từ user
      ├── /api/cron/scan        → Quét tin (mỗi 1h)
      ├── /api/cron/morning     → Bản tin sáng (08:00)
      └── /api/cron/alerts      → Check pre-event (mỗi phút)
      |
      ├── [Supabase PostgreSQL]   → Dữ liệu bền vững
      ├── [Upstash Redis]         → Queue gửi tin, lock chống trùng cron
      └── [ForexFactory / API]    → Nguồn dữ liệu
```

**Thay đổi quan trọng so với plan cũ:**

- Thêm **Upstash Redis** (serverless Redis, free tier) để:
    - Làm message queue khi gửi nhiều Telegram messages
    - Distributed lock để tránh cron chạy trùng
    - Cache kết quả scraping
- Tách **webhook** và **cron** thành các function riêng biệt để kiểm soát timeout
- Thêm **secret token** xác thực cho cron endpoints

---

## 3. Công Nghệ & Lý Do Lựa Chọn

|Thành phần|Lựa chọn|Lý do cụ thể|
|---|---|---|
|Runtime|Node.js 20 (LTS)|Ổn định, tương thích Vercel tốt nhất|
|Framework|NestJS v10+|Module hóa, DI tốt cho project lớn|
|Telegram|grammy hoặc nestjs-telegraf|grammy nhẹ hơn, phù hợp serverless|
|Database|Supabase (PostgreSQL)|Free tier đủ dùng, Row Level Security|
|Cache/Queue|Upstash Redis|Serverless Redis, free 10k req/ngày|
|Scraping|axios + cheerio|Nhẹ, đủ dùng với rate 1h/lần|
|Scraping fallback|ScrapingBee / ScraperAPI|Khi bị chặn IP|
|Timezone|date-fns-tz|Xử lý múi giờ chính xác|
|Validation|zod|Validate data từ scraper trước khi lưu DB|
|Logging|pino|Có structured logging, tích hợp Vercel logs tốt|
|CI/CD|GitHub Actions + Vercel|Auto deploy|

---

## 4. Thiết Kế Database (Cải Tiến)

### 4.1 Schema SQL Đầy Đủ

```sql
-- Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id  BIGINT UNIQUE NOT NULL,
  username     TEXT,
  first_name   TEXT,
  language     TEXT DEFAULT 'vi',      -- 'vi' | 'en'
  timezone     TEXT DEFAULT 'Asia/Ho_Chi_Minh',
  is_active    BOOLEAN DEFAULT true,
  is_banned    BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- 2. Events (lịch kinh tế)
CREATE TABLE events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_hash   TEXT UNIQUE NOT NULL,   -- SHA256(currency + title + event_date + event_time)
  title        TEXT NOT NULL,
  currency     TEXT NOT NULL,
  impact       TEXT CHECK (impact IN ('High', 'Medium', 'Low', 'Holiday')),
  event_date   DATE NOT NULL,
  event_time   TIME,                   -- Lưu theo UTC
  forecast     TEXT,
  previous     TEXT,
  actual       TEXT,                   -- NULL = chưa có kết quả
  detail_url   TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  -- Đánh dấu vòng quét nào phát hiện
  scan_batch_id TEXT
);

-- Index quan trọng
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_impact ON events(impact);
CREATE INDEX idx_events_currency ON events(currency);
CREATE INDEX idx_events_time ON events(event_date, event_time);

-- 3. Cấu hình alert của từng user
CREATE TABLE user_settings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  -- Bản tin sáng
  morning_enabled BOOLEAN DEFAULT true,
  morning_time    TIME DEFAULT '08:00:00',  -- Giờ local của user
  -- Pre-event alerts
  alert_enabled   BOOLEAN DEFAULT true,
  alert_minutes   INTEGER DEFAULT 15 CHECK (alert_minutes BETWEEN 1 AND 120),
  -- Bộ lọc
  impact_filter   TEXT[] DEFAULT '{"High"}',
  currency_filter TEXT[],    -- NULL = tất cả currencies
  UNIQUE(user_id)
);

-- 4. Log thông báo đã gửi (idempotency key)
CREATE TABLE notification_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idempotency_key TEXT UNIQUE NOT NULL,  -- user_id:event_id:type:date
  user_id       UUID REFERENCES users(id),
  event_id      UUID REFERENCES events(id),
  type          TEXT CHECK (type IN ('new_event', 'morning_briefing', 'pre_alert', 'actual_update')),
  status        TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped')),
  error_msg     TEXT,
  sent_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notif_key ON notification_log(idempotency_key);
CREATE INDEX idx_notif_user ON notification_log(user_id, sent_at);

-- 5. Scan history (theo dõi sức khỏe scraper)
CREATE TABLE scan_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id      TEXT UNIQUE NOT NULL,
  started_at    TIMESTAMPTZ DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  events_found  INTEGER DEFAULT 0,
  events_new    INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  error_msg     TEXT,
  source        TEXT DEFAULT 'forexfactory'  -- cho phép thêm nguồn khác sau
);

-- 6. Bot config (key-value store linh hoạt)
CREATE TABLE bot_config (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed config mặc định
INSERT INTO bot_config VALUES
  ('scraping_enabled', 'true', now()),
  ('notification_enabled', 'true', now()),
  ('max_events_per_message', '10', now()),
  ('cron_secret', 'changeme_use_env_var', now());
```

### 4.2 Logic `event_hash`

```typescript
import { createHash } from 'crypto';

function generateEventHash(event: {
  currency: string;
  title: string;
  eventDate: string;   // YYYY-MM-DD
  eventTime: string;   // HH:MM (UTC), hoặc 'all-day'
}): string {
  const raw = `${event.currency}|${event.title.toLowerCase().trim()}|${event.eventDate}|${event.eventTime}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}
```

> **Lưu ý:** Không dùng `actual` hay `forecast` trong hash vì chúng sẽ thay đổi. Hash chỉ xác định _định danh sự kiện_, còn update giá trị là bước riêng.

---

## 5. Module Scraping ForexFactory (Chiến Lược Chống Chặn)

### 5.1 Các lớp bảo vệ

```
Layer 1: Rate limiting — Tối đa 1 request/giờ, random delay 2-5s trước mỗi request
Layer 2: Headers giả lập — Rotate User-Agent, Accept-Language, Referer hợp lệ
Layer 3: Retry với exponential backoff — 3 lần retry nếu lỗi 5xx hoặc timeout
Layer 4: Circuit breaker — Nếu 3 lần liên tiếp thất bại, tắt scraping, alert admin
Layer 5: Fallback sang API trả phí — ScraperAPI / ScrapingBee nếu bị chặn
```

### 5.2 Cấu trúc ForexFactoryService

```typescript
@Injectable()
export class ForexFactoryService {
  private circuitBreakerCount = 0;
  private readonly MAX_FAILURES = 3;

  constructor(
    private readonly httpService: HttpService,
    private readonly redis: UpstashRedisService,
    private readonly logger: PinoLogger,
  ) {}

  async fetchEvents(weekParam: 'this' | 'next' = 'this'): Promise<ParsedEvent[]> {
    // 1. Check circuit breaker
    if (this.circuitBreakerCount >= this.MAX_FAILURES) {
      this.logger.error('Circuit breaker OPEN — scraping disabled');
      throw new ScrapingCircuitOpenError();
    }

    // 2. Check cache (tránh scrape lại trong 55 phút)
    const cacheKey = `scrape:ff:${weekParam}:${new Date().toISOString().slice(0, 13)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // 3. Random delay
    await sleep(randomInt(2000, 5000));

    try {
      const html = await this.fetchWithRetry(weekParam);
      const events = this.parseHTML(html);
      
      // 4. Validate data
      const validated = events.filter(e => this.isValidEvent(e));
      
      // 5. Cache 55 phút
      await this.redis.setex(cacheKey, 3300, JSON.stringify(validated));
      
      this.circuitBreakerCount = 0; // reset on success
      return validated;
    } catch (err) {
      this.circuitBreakerCount++;
      throw err;
    }
  }

  private async fetchWithRetry(weekParam: string, attempt = 1): Promise<string> {
    const url = `https://www.forexfactory.com/calendar?week=${weekParam}`;
    try {
      const { data } = await this.httpService.axiosRef.get(url, {
        headers: this.getRandomHeaders(),
        timeout: 15000,
      });
      return data;
    } catch (err) {
      if (attempt < 3) {
        await sleep(attempt * 3000); // exponential backoff
        return this.fetchWithRetry(weekParam, attempt + 1);
      }
      throw err;
    }
  }

  private parseHTML(html: string): ParsedEvent[] {
    const $ = cheerio.load(html);
    const events: ParsedEvent[] = [];
    let currentDate: string | null = null;

    $('tr.calendar__row').each((_, row) => {
      const $row = $(row);

      // ForexFactory gộp ngày vào row đầu tiên của ngày đó
      const dateCell = $row.find('td.calendar__date').text().trim();
      if (dateCell) currentDate = this.parseFFDate(dateCell);

      if (!currentDate) return;

      const time = $row.find('td.calendar__time').text().trim();
      const currency = $row.find('td.calendar__currency').text().trim();
      const impactClass = $row.find('td.calendar__impact span').attr('class') ?? '';
      const title = $row.find('td.calendar__event').text().trim();
      const forecast = $row.find('td.calendar__forecast').text().trim();
      const previous = $row.find('td.calendar__previous').text().trim();
      const actual = $row.find('td.calendar__actual').text().trim();

      if (!title || !currency) return;

      events.push({
        title,
        currency,
        impact: this.parseImpact(impactClass),
        eventDate: currentDate,
        eventTime: this.parseTime(time), // Convert sang UTC
        forecast: forecast || null,
        previous: previous || null,
        actual: actual || null,
      });
    });

    return events;
  }

  private getRandomHeaders() {
    const agents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
    ];
    return {
      'User-Agent': agents[randomInt(0, agents.length)],
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.google.com/',
      'Cache-Control': 'no-cache',
    };
  }
}
```

### 5.3 Xử lý múi giờ đúng cách

ForexFactory hiển thị giờ theo **múi giờ người dùng** (phụ thuộc IP). Khi deploy lên Vercel (US region), giờ sẽ là ET hoặc UTC. Cần:

1. Parse giờ hiển thị trên trang
2. Xác định offset từ metadata của trang (có element ẩn chứa timezone)
3. Convert sang UTC trước khi lưu DB
4. Khi gửi thông báo, convert từ UTC sang timezone của user

```typescript
import { toZonedTime, fromZonedTime, format } from 'date-fns-tz';

// Luôn lưu UTC vào DB
function toUtcTime(localTime: string, localDate: string, sourceTimezone: string): Date {
  const localDateTime = `${localDate}T${localTime}:00`;
  return fromZonedTime(localDateTime, sourceTimezone);
}

// Hiển thị theo timezone của user
function formatForUser(utcDate: Date, userTimezone: string): string {
  return format(toZonedTime(utcDate, userTimezone), 'HH:mm dd/MM', { timeZone: userTimezone });
}
```

---

## 6. Cron Jobs — Chống Trùng Lặp Với Distributed Lock

Vercel Cron có thể trigger nhiều lần trong edge cases. Dùng Redis lock:

```typescript
@Injectable()
export class CronService {
  constructor(private redis: UpstashRedisService) {}

  async withLock(lockKey: string, ttl: number, fn: () => Promise<void>): Promise<void> {
    const lockValue = `${Date.now()}-${Math.random()}`;
    // SET NX EX — chỉ set nếu chưa tồn tại
    const acquired = await this.redis.set(lockKey, lockValue, { nx: true, ex: ttl });
    if (!acquired) {
      this.logger.warn(`Lock ${lockKey} already held — skipping`);
      return;
    }
    try {
      await fn();
    } finally {
      // Chỉ xóa lock nếu vẫn là của mình
      const current = await this.redis.get(lockKey);
      if (current === lockValue) await this.redis.del(lockKey);
    }
  }

  async handleScanNews() {
    await this.withLock('cron:scan', 300, async () => {
      // ... logic scraping
    });
  }

  async handleMorningBriefing() {
    // Lock key theo ngày để tránh gửi 2 lần trong ngày
    const today = new Date().toISOString().slice(0, 10);
    await this.withLock(`cron:morning:${today}`, 3600, async () => {
      // ... logic bản tin sáng
    });
  }
}
```

---

## 7. Logic Phát Hiện Tin Mới & Cập Nhật Kết Quả

```
Scan mới về N events
      |
      ↓
Với mỗi event: tính event_hash
      |
      ├── Hash chưa có trong DB → INSERT → đánh dấu "new_event" → thông báo
      |
      └── Hash đã có trong DB →
              |
              ├── actual thay đổi (từ NULL → có giá trị) → UPDATE → thông báo "actual_update"
              |
              ├── forecast thay đổi → UPDATE silently (không thông báo)
              |
              └── Không đổi gì → bỏ qua
```

```typescript
async processScanResults(events: ParsedEvent[]): Promise<ScanSummary> {
  const newEvents: DbEvent[] = [];
  const updatedActuals: DbEvent[] = [];

  for (const event of events) {
    const hash = generateEventHash(event);
    const existing = await this.supabase.getEventByHash(hash);

    if (!existing) {
      // Tin mới hoàn toàn
      const saved = await this.supabase.insertEvent({ ...event, event_hash: hash });
      newEvents.push(saved);
    } else {
      // Kiểm tra actual mới
      const hadNoActual = !existing.actual;
      const hasActualNow = !!event.actual;
      
      if (hadNoActual && hasActualNow) {
        await this.supabase.updateEvent(existing.id, { 
          actual: event.actual,
          last_updated_at: new Date() 
        });
        updatedActuals.push({ ...existing, actual: event.actual });
      }
    }
  }

  return { newEvents, updatedActuals };
}
```

---

## 8. Hệ Thống Gửi Thông Báo Telegram

### 8.1 Message Queue để tránh rate limit

Telegram giới hạn **30 messages/giây** (global) và **1 message/giây per chat**. Khi có 100+ users, cần queue:

```typescript
@Injectable()
export class TelegramSenderService {
  private queue: Array<{ chatId: number; message: string }> = [];
  private isSending = false;

  async enqueue(chatId: number, message: string) {
    this.queue.push({ chatId, message });
    if (!this.isSending) this.startDraining();
  }

  private async startDraining() {
    this.isSending = true;
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, 25); // 25 msg/giây an toàn
      await Promise.allSettled(
        batch.map(({ chatId, message }) =>
          this.bot.telegram.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' })
            .catch(err => {
              if (err.code === 403) {
                // User đã block bot → đánh dấu is_active = false
                this.supabase.deactivateUser(chatId);
              }
            })
        )
      );
      if (this.queue.length > 0) await sleep(1000); // 1 giây giữa các batch
    }
    this.isSending = false;
  }
}
```

### 8.2 Format Tin Nhắn

```typescript
// Tin mới xuất hiện
function formatNewEvent(event: DbEvent): string {
  const impactEmoji = { High: '🔴', Medium: '🟡', Low: '🟢', Holiday: '🏖️' };
  const timeStr = event.event_time 
    ? `⏰ ${formatUtcToLocal(event.event_time, 'Asia/Ho_Chi_Minh')}`
    : '⏰ All Day';
  
  return [
    `📌 *Tin mới xuất hiện*`,
    ``,
    `${impactEmoji[event.impact]} ${escapeMarkdown(event.title)}`,
    `💱 ${event.currency} | ${timeStr}`,
    event.forecast ? `📊 Dự báo: ${event.forecast}` : '',
    event.previous ? `📈 Trước: ${event.previous}` : '',
  ].filter(Boolean).join('\n');
}

// Bản tin sáng
function formatMorningBriefing(events: DbEvent[], date: Date): string {
  const dateStr = format(date, 'dd/MM/yyyy', { timeZone: 'Asia/Ho_Chi_Minh' });
  const grouped = groupBy(events, 'impact');
  
  let msg = `📅 *Lịch Kinh Tế Hôm Nay — ${dateStr}*\n\n`;
  
  for (const impact of ['High', 'Medium', 'Low']) {
    if (!grouped[impact]?.length) continue;
    const emoji = { High: '🔴', Medium: '🟡', Low: '🟢' }[impact];
    msg += `${emoji} *${impact} Impact*\n`;
    grouped[impact].forEach(e => {
      const time = e.event_time ? formatUtcToLocal(e.event_time, 'Asia/Ho_Chi_Minh') : 'All Day';
      msg += `  • ${time} — ${e.currency} ${escapeMarkdown(e.title)}`;
      if (e.forecast) msg += ` _(${e.forecast})_`;
      msg += '\n';
    });
    msg += '\n';
  }
  
  return msg;
}

// Cảnh báo trước sự kiện
function formatPreAlert(event: DbEvent, minutesBefore: number): string {
  return [
    `⚠️ *Sắp diễn ra trong ${minutesBefore} phút*`,
    ``,
    `🔴 ${escapeMarkdown(event.title)}`,
    `💱 ${event.currency} | ⏰ ${formatUtcToLocal(event.event_time!, 'Asia/Ho_Chi_Minh')}`,
    event.forecast ? `📊 Dự báo: ${event.forecast}` : '',
    event.previous ? `📈 Kỳ trước: ${event.previous}` : '',
    ``,
    `_Nguồn: ForexFactory_`,
  ].filter(Boolean).join('\n');
}
```

---

## 9. Xác Thực & Bảo Mật

### 9.1 Webhook Verification

```typescript
// telegram/telegram.guard.ts
@Injectable()
export class TelegramWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const secretToken = req.headers['x-telegram-bot-api-secret-token'];
    return secretToken === process.env.TELEGRAM_WEBHOOK_SECRET;
  }
}
```

Khi set webhook:

```
https://api.telegram.org/bot{TOKEN}/setWebhook?url={URL}&secret_token={RANDOM_SECRET}
```

### 9.2 Bảo Vệ Cron Endpoints

```typescript
// cron/cron.guard.ts
@Injectable()
export class CronAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    // Vercel tự thêm header này cho cron requests
    const isVercelCron = req.headers['x-vercel-cron'] === '1';
    // Hoặc dùng secret token riêng
    const hasSecret = req.headers['x-cron-secret'] === process.env.CRON_SECRET;
    return isVercelCron || hasSecret;
  }
}
```

---

## 10. Commands Bot (Đầy Đủ)

```
/start              — Đăng ký, nhận hướng dẫn
/subscribe          — Bật tất cả thông báo (default settings)
/unsubscribe        — Tắt tất cả thông báo
/settings           — Xem cấu hình hiện tại
/settime HH:MM      — Đặt giờ nhận bản tin sáng (VD: /settime 07:30)
/setalert 10        — Đặt cảnh báo trước X phút (VD: /setalert 10)
/setimpact High Medium  — Chọn mức độ impact muốn nhận
/setcurrency USD EUR    — Lọc theo đồng tiền (bỏ trống = tất cả)
/today              — Xem bản tin hôm nay ngay lập tức
/tomorrow           — Xem sự kiện ngày mai
/next               — Sự kiện kế tiếp trong 2 giờ tới
/help               — Hướng dẫn sử dụng
```

---

## 11. Cấu Trúc Thư Mục Dự Án

```
forex-news-bot/
├── src/
│   ├── app.module.ts
│   ├── main.ts                     # Serverless handler
│   ├── config/
│   │   └── configuration.ts        # Zod-validated env config
│   ├── telegram/
│   │   ├── telegram.module.ts
│   │   ├── telegram.update.ts      # Command handlers
│   │   ├── telegram.guard.ts       # Webhook auth
│   │   ├── telegram-sender.service.ts  # Rate-limited sender
│   │   └── message-formatter.ts   # Format tin nhắn
│   ├── scraper/
│   │   ├── scraper.module.ts
│   │   ├── forex-factory.service.ts
│   │   └── scraper.types.ts
│   ├── events/
│   │   ├── events.module.ts
│   │   ├── events.service.ts       # Business logic
│   │   └── events.repository.ts   # Supabase queries
│   ├── notification/
│   │   ├── notification.module.ts
│   │   └── notification.service.ts # Orchestrate gửi thông báo
│   ├── cron/
│   │   ├── cron.module.ts
│   │   ├── cron.controller.ts      # API endpoints cho Vercel Cron
│   │   ├── cron.service.ts
│   │   └── cron.guard.ts
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.service.ts
│   │   └── users.repository.ts
│   ├── supabase/
│   │   └── supabase.service.ts
│   └── redis/
│       └── redis.service.ts        # Upstash Redis wrapper
├── vercel.json
├── .env.example
└── package.json
```

---

## 12. Environment Variables Đầy Đủ

```bash
# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=           # Random string, set khi register webhook

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=              # Service role key (bypass RLS)

# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Cron Security
CRON_SECRET=                       # Random string để auth cron endpoints

# Admin
ADMIN_TELEGRAM_ID=                 # Chat ID nhận alert lỗi

# Scraping
SCRAPING_USER_AGENT_ROTATION=true
SCRAPER_API_KEY=                   # Fallback nếu bị chặn (ScraperAPI)

# App
NODE_ENV=production
TZ=UTC                             # Vercel function timezone
```

---

## 13. Kế Hoạch Phát Triển Theo Sprint

### Sprint 1 (Tuần 1-2): Foundation

- [ ] Khởi tạo NestJS project, cấu hình Vercel deploy
- [ ] Setup Supabase + chạy migration SQL
- [ ] Setup Upstash Redis
- [ ] Deploy thử nghiệm một serverless function đơn giản
- [ ] Bot cơ bản: /start, /help hoạt động được

### Sprint 2 (Tuần 3): Scraping

- [ ] Xây dựng ForexFactoryService với đầy đủ error handling
- [ ] Test parse HTML với dữ liệu thật
- [ ] Xử lý timezone conversion
- [ ] Lưu vào DB, test logic phát hiện tin mới

### Sprint 3 (Tuần 4): Cron & Notifications

- [ ] Cron endpoints + distributed lock
- [ ] Morning briefing logic
- [ ] Pre-event alert logic (check từng phút)
- [ ] Message queue với rate limiting

### Sprint 4 (Tuần 5): Commands & UX

- [ ] Tất cả commands user (/settings, /settime, /today, ...)
- [ ] Format tin nhắn đẹp, test với nhiều trường hợp
- [ ] Xử lý user block bot (lỗi 403)

### Sprint 5 (Tuần 6): Hardening

- [ ] Monitoring: gửi alert lỗi cho admin
- [ ] Logging đầy đủ với pino
- [ ] Load test với N users mô phỏng
- [ ] Circuit breaker cho scraper
- [ ] Viết runbook xử lý sự cố

---

## 14. Monitoring & Alerts Cho Admin

```typescript
@Injectable()
export class AdminAlertService {
  async alertAdmin(type: string, detail: string) {
    const msg = [
      `🚨 *Bot Alert*`,
      `Type: \`${type}\``,
      `Time: ${new Date().toISOString()}`,
      `Detail: ${escapeMarkdown(detail)}`,
    ].join('\n');

    await this.bot.telegram.sendMessage(
      process.env.ADMIN_TELEGRAM_ID!,
      msg,
      { parse_mode: 'MarkdownV2' }
    );
  }
}

// Các event cần alert admin:
// - Circuit breaker mở (scraping thất bại 3 lần)
// - Cron job timeout
// - Supabase connection error
// - Queue backlog > 100 messages
// - Số user active giảm đột ngột
```

---

## 15. Chi Phí Ước Tính

|Dịch vụ|Gói|Chi phí/tháng|
|---|---|---|
|Vercel|Pro (cần cho cron mỗi phút)|$20|
|Supabase|Free tier (500MB DB, 2GB bandwidth)|$0|
|Upstash Redis|Free tier (10k req/ngày)|$0|
|ScraperAPI|Free tier (1000 credits/tháng)|$0 (fallback)|
|**Tổng**||**~$20/tháng**|

> Nếu muốn tiết kiệm hơn: dùng **Railway.app** ($5/tháng) hoặc **Fly.io** (free tier) để host NestJS như một long-running server thay vì serverless, khi đó không cần Vercel Pro và có thể dùng `setInterval` thay cron.

---

## 16. Rủi Ro & Giảm Thiểu

|Rủi ro|Xác suất|Giải pháp|
|---|---|---|
|ForexFactory thay đổi HTML structure|Cao|Monitor scan_log, alert admin ngay, có selector fallback|
|ForexFactory block IP Vercel|Trung bình|ScraperAPI fallback, rotate headers|
|Vercel cold start > 10s|Thấp|Warm up function bằng cron dummy|
|Supabase free tier hết quota|Thấp|Monitor usage, cleanup notification_log cũ hàng tuần|
|Telegram API thay đổi|Rất thấp|Dùng thư viện stable, theo dõi changelog|

---

_Plan này bao quát đầy đủ từ architecture đến từng dòng code, bảo mật, chi phí và rủi ro. Bắt đầu từ Sprint 1 là hợp lý nhất._