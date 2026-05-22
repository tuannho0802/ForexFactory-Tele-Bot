import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';

type AnyRecord = Record<string, any>;

const token = process.env.TELEGRAM_BOT_TOKEN!;
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const bot = new Telegraf(token);
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function readJsonBody(req: any): Promise<any> {
  // If Vercel already parsed it
  if (req?.body && typeof req.body === 'object') {
    console.log('[Webhook] Body already parsed by Vercel');
    return req.body;
  }

  // If it's a string, try to parse it
  if (typeof req.body === 'string') {
    try {
      console.log('[Webhook] Parsing body from string');
      return JSON.parse(req.body);
    } catch (e) {
      console.error('[Webhook] Failed to parse req.body string:', e);
    }
  }

  // Fallback: read from stream
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    console.log('[Webhook] Raw body from stream length:', raw.length);
    if (!raw) return undefined;
    return JSON.parse(raw);
  } catch (err) {
    console.error('[Webhook] Error reading stream:', err);
    return undefined;
  }
}

async function ensureUser(telegramId: number, username?: string, firstName?: string) {
  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        telegram_id: telegramId,
        username: username ?? null,
        first_name: firstName ?? null,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'telegram_id', ignoreDuplicates: false },
    )
    .select()
    .single();

  if (error) throw error;
  return data as AnyRecord;
}

async function getUserByTelegramId(telegramId: number) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  if (error) throw error;
  return data as AnyRecord | null;
}

async function getUserSettings(userId: string) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as AnyRecord | null;
}

async function upsertSettings(userId: string, settings: AnyRecord) {
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, ...settings }, { onConflict: 'user_id' });
  if (error) throw error;
}

bot.start(async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  await ensureUser(from.id, from.username, from.first_name);
  await ctx.reply(
    `👋 Xin chào ${from.first_name ?? 'bạn'}!\n\n` +
      `🤖 Đây là Forex News Bot — theo dõi lịch kinh tế ForexFactory.\n\n` +
      `📌 Dùng /subscribe để bắt đầu nhận thông báo\n` +
      `📖 Xem hướng dẫn: /help`,
  );
});

bot.help(async (ctx) => {
  await ctx.reply(
    '📖 HƯỚNG DẪN SỬ DỤNG FOREX NEWS BOT\n' +
      '━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      '👤 BẮT ĐẦU\n' +
      '/start — Đăng ký tài khoản\n' +
      '/subscribe — Bật nhận thông báo\n' +
      '/unsubscribe — Tắt tất cả thông báo\n\n' +
      '⚙️ CẤU HÌNH\n' +
      '/setimpact High Medium — Chọn mức độ tác động\n' +
      '/setcurrency USD EUR GBP — Lọc theo đồng tiền\n' +
      '/settime 08:00 — Giờ nhận bản tin sáng\n' +
      '/setalert 15 — Cảnh báo trước N phút\n\n' +
      '🔧 QUẢN LÝ\n' +
      '/settings — Xem cài đặt hiện tại',
  );
});

bot.command('subscribe', async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const user = await ensureUser(from.id, from.username, from.first_name);

  await supabase.from('users').update({ is_active: true }).eq('id', user.id);
  await upsertSettings(user.id, {
    morning_enabled: true,
    alert_enabled: true,
    impact_filter: ['High', 'Medium'],
    currency_filter: [],
    alert_minutes: 15,
    morning_time: '08:00:00',
  });

  await ctx.reply(
    '✅ Đã bật thông báo!\n\n' +
      '⚙️ Cài đặt mặc định:\n' +
      '  • Bộ lọc: High, Medium\n' +
      '  • Tiền tệ: Tất cả\n' +
      '  • Bản tin sáng: 08:00\n' +
      '  • Cảnh báo trước: 15 phút\n\n' +
      'Dùng /settings để xem chi tiết',
  );
});

bot.command('unsubscribe', async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const user = await getUserByTelegramId(from.id);
  if (!user) return ctx.reply('Vui lòng dùng /start trước.');

  await supabase.from('users').update({ is_active: false }).eq('id', user.id);
  await ctx.reply('❌ Đã tắt tất cả thông báo. Dùng /subscribe để bật lại.');
});

bot.command('settings', async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const user = await getUserByTelegramId(from.id);
  if (!user) return ctx.reply('Vui lòng dùng /start trước.');

  const settings = await getUserSettings(user.id);
  if (!settings) return ctx.reply('Chưa có cài đặt. Dùng /subscribe để khởi tạo.');

  const impactList = Array.isArray(settings.impact_filter)
    ? settings.impact_filter.join(', ')
    : 'Không có';
  const currencyList =
    Array.isArray(settings.currency_filter) && settings.currency_filter.length
      ? settings.currency_filter.join(', ')
      : 'Tất cả';
  const status = user.is_active ? '✅ Đang hoạt động' : '❌ Chưa subscribe';

  await ctx.reply(
    '⚙️ CÀI ĐẶT HIỆN TẠI\n' +
      '━━━━━━━━━━━━━━━━━━━━━━\n\n' +
      `📡 Trạng thái: ${status}\n\n` +
      `🌅 Bản tin sáng: ${settings.morning_enabled ? '✅ Bật' : '❌ Tắt'}\n` +
      `⏰ Giờ nhận: ${(settings.morning_time ?? '08:00').toString().slice(0, 5)}\n\n` +
      `⚠️ Cảnh báo trước: ${settings.alert_enabled ? '✅ Bật' : '❌ Tắt'}\n` +
      `🔔 Thời gian: ${settings.alert_minutes ?? 15} phút\n\n` +
      `🎯 Mức độ tác động: ${impactList}\n` +
      `💱 Đồng tiền: ${currencyList}`,
  );
});

bot.command('setimpact', async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const text = (ctx.message as any)?.text as string | undefined;
  if (!text) return;

  const args = text.split(' ').slice(1);
  const valid = ['High', 'Medium', 'Low', 'Holiday'];
  const selected = args
    .map((a) => a.charAt(0).toUpperCase() + a.slice(1).toLowerCase())
    .filter((a) => valid.includes(a));

  if (selected.length === 0) {
    return ctx.reply('❌ Cú pháp: /setimpact High Medium\nHợp lệ: High | Medium | Low | Holiday');
  }

  const user = await getUserByTelegramId(from.id);
  if (!user) return ctx.reply('Vui lòng dùng /start trước.');

  await upsertSettings(user.id, { impact_filter: selected });
  await ctx.reply(`✅ Đã cập nhật bộ lọc:\n${selected.map((i) => `  • ${i}`).join('\n')}`);
});

bot.command('setcurrency', async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const text = (ctx.message as any)?.text as string | undefined;
  if (!text) return;

  const args = text.split(' ').slice(1);
  const user = await getUserByTelegramId(from.id);
  if (!user) return ctx.reply('Vui lòng dùng /start trước.');

  if (args.length === 0 || args[0].toLowerCase() === 'all') {
    await upsertSettings(user.id, { currency_filter: [] });
    return ctx.reply('✅ Đã bỏ lọc tiền tệ — nhận tất cả các đồng tiền.');
  }

  const currencies = args.map((a) => a.toUpperCase());
  await upsertSettings(user.id, { currency_filter: currencies });
  await ctx.reply(`✅ Đã cập nhật bộ lọc tiền tệ:\n${currencies.map((c) => `  • ${c}`).join('\n')}`);
});

bot.command('settime', async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const text = (ctx.message as any)?.text as string | undefined;
  if (!text) return;

  const timeStr = text.split(' ')[1];
  if (!timeStr || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(timeStr)) {
    return ctx.reply('❌ Định dạng sai. Ví dụ: /settime 08:30');
  }

  const user = await getUserByTelegramId(from.id);
  if (!user) return ctx.reply('Vui lòng dùng /start trước.');

  await upsertSettings(user.id, { morning_time: `${timeStr}:00` });
  await ctx.reply(`✅ Đã đặt giờ nhận bản tin: ${timeStr}`);
});

bot.command('setalert', async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const text = (ctx.message as any)?.text as string | undefined;
  if (!text) return;

  const minutes = parseInt(text.split(' ')[1], 10);
  if (Number.isNaN(minutes) || minutes < 1 || minutes > 120) {
    return ctx.reply('❌ Nhập số phút từ 1 đến 120. Ví dụ: /setalert 15');
  }

  const user = await getUserByTelegramId(from.id);
  if (!user) return ctx.reply('Vui lòng dùng /start trước.');

  await upsertSettings(user.id, { alert_minutes: minutes });
  await ctx.reply(`✅ Đã đặt cảnh báo trước ${minutes} phút.`);
});

const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

export default async (req: any, res: any) => {
  console.log(`[Webhook] Received ${req.method} request`);

  if (req.method !== 'POST') {
    return res
      .status(200)
      .json({ ok: true, message: 'Telegram webhook endpoint is running' });
  }

  if (webhookSecret) {
    const tokenHeader =
      req.headers['x-telegram-bot-api-secret-token'] ??
      req.headers['X-Telegram-Bot-Api-Secret-Token'];
    
    // Chỉ từ chối nếu có token trong request nhưng không khớp.
    // Nếu không có token trong request (ví dụ health check), bỏ qua xác thực.
    if (tokenHeader && tokenHeader !== webhookSecret) {
      console.warn('[Webhook] Unauthorized - token mismatch');
      return res.status(200).json({ ok: false, error: 'Unauthorized' });
    }
  }

  try {
    const body = await readJsonBody(req);
    console.log('[Webhook] Update received:', body?.update_id);
    
    if (!body || !body.update_id) {
      console.warn('[Webhook] No body or update_id found');
      return res.status(200).json({ ok: true, message: 'No body' });
    }

    await bot.handleUpdate(body);
    console.log('[Webhook] Update handled successfully');
  } catch (err: any) {
    console.error('[Webhook] Error handling update:', err?.message ?? err);
    // Luôn trả về 200 OK cho Telegram để tránh bị disable webhook
  }

  return res.status(200).json({ ok: true });
};
