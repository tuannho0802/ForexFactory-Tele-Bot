import { UserSettings } from '../users/users.types';
import { DbEvent } from '../events/events.types';
import { formatUtcToLocal } from '../common/utils/time.util';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { vi } from 'date-fns/locale';
import { escapeMarkdownV2 } from '../common/utils/string.util';

const IMPACT_EMOJIS: Record<string, string> = {
  High: '🔴',
  Medium: '🟡',
  Low: '🟢',
  Holiday: '⚪',
};

const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━';
const FOOTER = '\n_📊 Dữ liệu từ Forex Factory_';

function formatEventBlock(e: DbEvent, userTimezone: string): string {
  const emoji = IMPACT_EMOJIS[e.impact] || '⚪';
  let time = 'All Day';
  if (e.event_time) {
    try {
      time = formatUtcToLocal(e.event_time, userTimezone);
    } catch {
      time = e.event_time.slice(0, 5);
    }
  }

  let block = `${DIVIDER}\n`;
  block += `${emoji} ${escapeMarkdownV2(time)} • ${escapeMarkdownV2(e.currency)}\n`;
  block += `*${escapeMarkdownV2(e.title)}*\n`;

  const dataLines: string[] = [];
  if (e.actual) dataLines.push(`🎯 Thực tế: *${escapeMarkdownV2(String(e.actual))}*`);
  if (e.forecast) dataLines.push(`📊 Dự báo: ${escapeMarkdownV2(String(e.forecast))}`);
  if (e.previous) dataLines.push(`📉 Trước: ${escapeMarkdownV2(String(e.previous))}`);

  if (dataLines.length > 0) {
    block += dataLines.join(' \\| ') + '\n';
  }

  return block;
}

function getHeader(date: Date, userTimezone: string, title: string): string {
  const zonedDate = toZonedTime(date, userTimezone);
  const dateStr = formatInTimeZone(zonedDate, userTimezone, "eeee, dd/MM/yyyy", { locale: vi });
  const capitalizedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  const tzOffset = formatInTimeZone(zonedDate, userTimezone, "xxx");
  
  return `📅 *${escapeMarkdownV2(title)}*\n🕒 ${escapeMarkdownV2(capitalizedDate)} \\(UTC${escapeMarkdownV2(tzOffset)}\\)\n`;
}

export function formatNewEvent(event: DbEvent, userTimezone: string): string {
  let msg = `📌 *TIN MỚI XUẤT HIỆN*\n`;
  msg += formatEventBlock(event, userTimezone);
  msg += DIVIDER;
  msg += FOOTER;
  return msg;
}

export function formatActualUpdate(event: DbEvent, userTimezone: string): string {
  let msg = `✅ *CẬP NHẬT KẾT QUẢ THỰC TẾ*\n`;
  msg += formatEventBlock(event, userTimezone);
  msg += DIVIDER;
  msg += FOOTER;
  return msg;
}

export function formatMorningBriefing(events: DbEvent[], date: Date, userTimezone: string): string {
  if (events.length === 0) {
    return `${getHeader(date, userTimezone, 'Lịch Kinh Tế Hôm Nay')}\n_Không có tin tức kinh tế quan trọng nào diễn ra hôm nay\\._${FOOTER}`;
  }

  return formatEventList(events, userTimezone, date, 'Lịch Kinh Tế Hôm Nay');
}

export function formatPreAlert(event: DbEvent, minutesBefore: number, userTimezone: string): string {
  let msg = `⚠️ *SẮP DIỄN RA TRONG ${minutesBefore} PHÚT*\n`;
  msg += formatEventBlock(event, userTimezone);
  msg += DIVIDER;
  msg += FOOTER;
  return msg;
}

export function formatSettings(settings: UserSettings, user: any): string {
  const currencyList = settings.currency_filter?.length
    ? settings.currency_filter.join(', ')
    : 'Tất cả';
  
  const status = user.is_active ? '✅ Đang hoạt động' : '❌ Chưa subscribe';
  const tz = settings.timezone || 'Asia/Ho_Chi_Minh';
  const morningTime = settings.morning_time ?? '08:00';
  const alertMins = settings.alert_minutes ?? 15;

  return (
    '⚙️ *CÀI ĐẶT HIỆN TẠI*\n' +
    '━━━━━━━━━━━━━━━━━━━━━━\n\n' +
    `📡 Trạng thái: ${escapeMarkdownV2(status)}\n\n` +
    `🌅 Bản tin sáng: ${settings.morning_enabled ? '✅ Bật' : '❌ Tắt'}\n` +
    `⏰ Giờ nhận bản tin: ${escapeMarkdownV2(morningTime)} \\(${escapeMarkdownV2(tz)}\\)\n\n` +
    `⚠️ Cảnh báo trước: ${settings.alert_enabled ? '✅ Bật' : '❌ Tắt'}\n` +
    `🔔 Thời gian báo trước: ${escapeMarkdownV2(String(alertMins))} phút\n\n` +
    `🕒 Múi giờ: ${escapeMarkdownV2(tz)}\n` +
    `   \\(Dùng /settimezone để thay đổi\\)\n\n` +
    `🎯 Mức độ tác động:\n  ${settings.impact_filter?.map(i => `• ${escapeMarkdownV2(i)}`).join('\n  ') ?? '• Không có'}\n\n` +
    `💱 Đồng tiền lọc: ${escapeMarkdownV2(currencyList)}\n\n` +
    '━━━━━━━━━━━━━━━━━━━━━━\n' +
    'Dùng /setimpact, /setcurrency, /settime, /setalert, /settimezone để thay đổi'
  );
}

/**
 * Formats a list of events into one or more messages (chunks) if needed.
 * Returns an array of strings if multiple messages are needed, or just one string.
 */
export function formatEventList(
  events: DbEvent[], 
  userTimezone: string, 
  date: Date = new Date(),
  title: string = 'Lịch Kinh Tế'
): string {
  if (events.length === 0) {
    return `${getHeader(date, userTimezone, title)}\n_Không có sự kiện nào được tìm thấy\\._${FOOTER}`;
  }

  const CHUNK_SIZE = 10;
  const chunks: string[] = [];
  
  for (let i = 0; i < events.length; i += CHUNK_SIZE) {
    const chunkEvents = events.slice(i, i + CHUNK_SIZE);
    const isMultiPart = events.length > CHUNK_SIZE;
    const partTitle = isMultiPart ? `${title} (Phần ${chunks.length + 1})` : title;
    
    let msg = getHeader(date, userTimezone, partTitle);
    
    chunkEvents.forEach(e => {
      msg += formatEventBlock(e, userTimezone);
    });
    
    msg += DIVIDER;
    msg += FOOTER;
    chunks.push(msg);
  }

  // Note: The caller (TelegramSender) usually expects a single string for simple replies.
  // If it's multi-part, we might need the caller to handle sending multiple messages.
  // For now, return the first chunk if we can't change the caller easily, 
  // or join them with a separator. But ideally, the controller should loop and send.
  return chunks.join('\n\n\n'); 
}

