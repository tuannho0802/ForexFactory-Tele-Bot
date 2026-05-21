# 📊 ForexFactory Telegram Bot

Bot Telegram tự động gửi thông báo lịch kinh tế từ [ForexFactory](https://www.forexfactory.com/), hỗ trợ cá nhân hóa theo mức độ tác động, đồng tiền và múi giờ người dùng.

## ✨ Tính năng

- 📅 **`/today`** – Xem sự kiện kinh tế hôm nay theo bộ lọc cá nhân (timezone-aware).
- 📆 **`/next`** – Xem sự kiện tuần sau.
- ⏰ **Bản tin sáng** – Tự động gửi tổng hợp sự kiện vào giờ tùy chọn mỗi ngày.
- 🔔 **Cảnh báo trước sự kiện** – Nhận thông báo trước X phút khi sự kiện quan trọng sắp diễn ra.
- 🌍 **Múi giờ cá nhân** – Hiển thị thời gian sự kiện theo múi giờ người dùng (`/settimezone`).
- 🎯 **Lọc theo tác động** – Chỉ nhận tin High, Medium, hoặc Low impact (`/setimpact`).
- 💱 **Lọc theo đồng tiền** – Chỉ nhận tin USD, EUR, GBP... (`/setcurrency`).
- 🔄 **Cron jobs 24/7** – Tự động scrape dữ liệu và gửi thông báo qua Vercel Cron.
- 📡 **Realtime updates** – Thông báo ngay khi có sự kiện mới hoặc số liệu thực tế (actual) được cập nhật.

## 🛠 Công nghệ

| Thành phần | Công nghệ |
|------------|-----------|
| **Backend** | [NestJS](https://nestjs.com/) (TypeScript) |
| **Database** | [Supabase](https://supabase.com/) (PostgreSQL) |
| **Telegram API** | [Telegraf](https://telegraf.js.org/) + [nestjs-telegraf](https://github.com/bukhalo/nestjs-telegraf) |
| **Scraping** | [Cheerio](https://cheerio.js.org/), [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) |
| **Deploy** | [Vercel](https://vercel.com/) (Serverless + Cron Jobs) |
| **Logging** | [Pino](https://getpino.io/) (nestjs-pino) |
| **Date/Time** | [date-fns](https://date-fns.org/) + [date-fns-tz](https://github.com/marnusw/date-fns-tz) |
| **Validation** | [Zod](https://zod.dev/) |

## 📁 Cấu trúc thư mục

```
Forex-Bot-Tele/
├── docs/                   # Tài liệu dự án
│   └── workflows.md        # Lịch sử thay đổi (append-only)
├── src/
│   ├── common/             # Guards, utils (time.util.ts)
│   ├── config/             # Cấu hình ứng dụng
│   ├── cron/               # Cron service & controller
│   ├── events/             # Event repository, service, types
│   ├── notification/       # Notification service (morning, alerts, updates)
│   ├── scraper/            # ForexFactory scraper (JSON/XML/HTML fallback)
│   ├── supabase/           # Supabase client service
│   ├── telegram/           # Telegram bot commands & message formatter
│   ├── users/              # User repository, service, types
│   ├── app.module.ts       # Root module
│   └── main.ts             # Entry point
├── supabase/
│   └── migrations/         # Database migrations
├── vercel.json             # Vercel deployment config
├── .env.example            # Mẫu biến môi trường
└── package.json
```

## 🚀 Cài đặt & Chạy local

### 1. Clone repo

```bash
git clone https://github.com/tuannho0802/ForexFactory-Tele-Bot.git
cd ForexFactory-Tele-Bot
```

### 2. Cài dependencies

```bash
npm install
```

### 3. Tạo file `.env`

Copy từ `.env.example` và điền các giá trị:

```bash
cp .env.example .env
```

Các biến môi trường cần thiết:

| Biến | Mô tả |
|------|--------|
| `TELEGRAM_BOT_TOKEN` | Token từ [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_WEBHOOK_SECRET` | Secret để xác thực webhook |
| `SUPABASE_URL` | URL của Supabase project |
| `SUPABASE_SERVICE_KEY` | Service role key của Supabase |
| `CRON_SECRET` | Secret để bảo vệ cron endpoints |
| `ADMIN_TELEGRAM_ID` | Chat ID của admin (nhận cảnh báo lỗi) |
| `NODE_ENV` | `development` hoặc `production` |
| `TZ` | `UTC` (khuyến nghị) |

### 4. Chạy database migration

Truy cập Supabase SQL Editor và chạy các migration trong `supabase/migrations/`.

Nếu chưa có cột `timezone`, chạy thêm:

```sql
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Ho_Chi_Minh';
```

### 5. Chạy ứng dụng

```bash
# Development (hot reload)
npm run start:dev

# Production
npm run build
npm run start:prod
```

## ☁️ Triển khai lên Vercel

### 1. Cấu hình `vercel.json`

File `vercel.json` đã được cấu hình sẵn với các routes:

- `/webhook/telegram` – Nhận webhook từ Telegram
- `/api/cron/scan` – Cron job scrape dữ liệu
- `/api/cron/morning` – Cron job gửi bản tin sáng
- `/api/cron/alerts` – Cron job cảnh báo trước sự kiện

### 2. Đặt biến môi trường

Trên Vercel Dashboard → Settings → Environment Variables, thêm tất cả biến từ `.env`.

### 3. Deploy

```bash
# Qua Vercel CLI
npm i -g vercel
vercel --prod

# Hoặc qua GitHub integration (tự động deploy khi push)
```

### 4. Cấu hình Cron Jobs

Trên Vercel Dashboard → Settings → Cron Jobs, thêm:

| Endpoint | Schedule | Mô tả |
|----------|----------|-------|
| `/api/cron/scan` | `*/10 * * * *` | Scrape mỗi 10 phút |
| `/api/cron/morning` | `* * * * *` | Kiểm tra gửi bản tin sáng mỗi phút |
| `/api/cron/alerts` | `* * * * *` | Kiểm tra cảnh báo trước sự kiện mỗi phút |

> **Lưu ý:** Các cron endpoints được bảo vệ bởi `CronAuthGuard` sử dụng header `Authorization: Bearer <CRON_SECRET>`.

## 🤖 Lệnh Telegram

| Lệnh | Mô tả |
|-------|--------|
| `/start` | Đăng ký tài khoản (trạng thái inactive) |
| `/subscribe` | Kích hoạt nhận thông báo |
| `/unsubscribe` | Tắt nhận thông báo |
| `/today` | Xem lịch kinh tế hôm nay (theo timezone & bộ lọc) |
| `/next` | Xem lịch kinh tế tuần sau |
| `/settings` | Xem cài đặt hiện tại |
| `/setimpact High Medium` | Đặt bộ lọc mức độ tác động |
| `/setcurrency USD EUR GBP` | Đặt bộ lọc đồng tiền (`all` = tất cả) |
| `/settimezone Asia/Ho_Chi_Minh` | Đặt múi giờ ([danh sách IANA](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)) |
| `/settime 08:00` | Đặt giờ nhận bản tin sáng |
| `/setalert 15` | Đặt thời gian cảnh báo trước sự kiện (phút) |
| `/help` | Xem hướng dẫn chi tiết |
| `/debug` | Xem thông tin debug (admin) |
| `/dbstatus` | Kiểm tra trạng thái database (admin) |

## 📖 Tài liệu thêm

Xem thư mục [`docs/`](docs/) để biết thêm chi tiết:

- **[`workflows.md`](docs/workflows.md)** – Lịch sử thay đổi và phát triển (append-only log).

## 📝 Đóng góp

1. Fork repo
2. Tạo branch mới: `git checkout -b feature/ten-tinh-nang`
3. Commit: `git commit -m "Thêm tính năng X"`
4. Push: `git push origin feature/ten-tinh-nang`
5. Tạo Pull Request

> Khi có thay đổi lớn, hãy cập nhật `docs/workflows.md` theo nguyên tắc append-only.

## 📄 License

UNLICENSED – Dự án riêng tư.
