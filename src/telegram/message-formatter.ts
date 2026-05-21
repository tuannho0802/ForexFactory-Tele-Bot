import { UserSettings } from '../users/users.types';
import { DbEvent } from '../events/events.types';
import { formatForUser, formatUtcToLocal } from '../common/utils/time.util';

export function escapeMarkdownV2(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

const IMPACT_EMOJIS: Record<string, string> = {
  High: '🔴',
  Medium: '🟡',
  Low: '🟢',
  Holiday: '🏖️',
};

export function formatNewEvent(event: DbEvent, userTimezone: string): string {
  const emoji = IMPACT_EMOJIS[event.impact] || 'ℹ️';
  let timeStr = '⏰ All Day';
  if (event.event_time) {
    try {
      const utcDate = new Date(`${event.event_date}T${event.event_time}Z`);
      timeStr = `⏰ ${escapeMarkdownV2(formatForUser(utcDate, userTimezone))}`;
    } catch (e) {
      timeStr = `⏰ ${escapeMarkdownV2(event.event_time)}`;
    }
  }

  const lines = [
    `📌 *TIN MỚI XUẤT HIỆN*`,
    ``,
    `${emoji} *${escapeMarkdownV2(event.title)}*`,
    `💱 *${escapeMarkdownV2(event.currency)}* \\| ${timeStr}`,
    `📊 Dự báo: ${event.forecast ? escapeMarkdownV2(String(event.forecast)) : 'N/A'}`,
    `📈 Trước: ${event.previous ? escapeMarkdownV2(String(event.previous)) : 'N/A'}`,
  ];

  if (event.detail_url) {
    lines.push(`🔗 [Xem chi tiết](${escapeMarkdownV2(String(event.detail_url))})`);
  }

  return lines.join('\n');
}

export function formatActualUpdate(event: DbEvent, userTimezone: string): string {
  const emoji = IMPACT_EMOJIS[event.impact] || 'ℹ️';
  let timeStr = '⏰ All Day';
  if (event.event_time) {
    try {
      const utcDate = new Date(`${event.event_date}T${event.event_time}Z`);
      timeStr = `⏰ ${escapeMarkdownV2(formatForUser(utcDate, userTimezone))}`;
    } catch (e) {
      timeStr = `⏰ ${escapeMarkdownV2(event.event_time)}`;
    }
  }

  return [
    `📢 *CẬP NHẬT KẾT QUẢ THỰC TẾ*`,
    ``,
    `${emoji} *${escapeMarkdownV2(event.title)}*`,
    `💱 *${escapeMarkdownV2(event.currency)}* \\| ${timeStr}`,
    `🎯 *Thực tế: ${escapeMarkdownV2(String(event.actual))}*`,
    `📊 Dự báo: ${event.forecast ? escapeMarkdownV2(String(event.forecast)) : 'N/A'}`,
    `📈 Trước: ${event.previous ? escapeMarkdownV2(String(event.previous)) : 'N/A'}`,
  ].join('\n');
}

export function formatMorningBriefing(events: DbEvent[], date: Date, userTimezone: string): string {
  const dateStr = date.toLocaleDateString('vi-VN', { timeZone: userTimezone });
  
  let msg = `📅 *LỊCH KINH TẾ HÔM NAY — ${escapeMarkdownV2(dateStr)}*\n\n`;

  if (events.length === 0) {
    msg += `_Không có tin tức kinh tế quan trọng nào diễn ra hôm nay\\._`;
    return msg;
  }

  const grouped: Record<string, DbEvent[]> = {
    High: [],
    Medium: [],
    Low: [],
    Holiday: [],
  };

  events.forEach((e) => {
    if (grouped[e.impact]) {
      grouped[e.impact].push(e);
    }
  });

  const order = ['High', 'Medium', 'Low', 'Holiday'];
  for (const impact of order) {
    const list = grouped[impact];
    if (!list || list.length === 0) continue;

    const emoji = IMPACT_EMOJIS[impact] || 'ℹ️';
    msg += `${emoji} *${impact} Impact*\n`;

    list.forEach((e) => {
      let time = 'All Day';
      if (e.event_time) {
        try {
          time = formatUtcToLocal(e.event_time, userTimezone);
        } catch {
          time = e.event_time.slice(0, 5);
        }
      }
      msg += `  • *${escapeMarkdownV2(time)}* — ${escapeMarkdownV2(e.currency)} ${escapeMarkdownV2(e.title)}`;
      if (e.forecast) {
        msg += ` _\\(Dự báo: ${escapeMarkdownV2(String(e.forecast))}\\)_`;
      }
      msg += '\n';
    });
    msg += '\n';
  }

  return msg.trim();
}

export function formatPreAlert(event: DbEvent, minutesBefore: number, userTimezone: string): string {
  const emoji = IMPACT_EMOJIS[event.impact] || 'ℹ️';
  let timeStr = '⏰ All Day';
  if (event.event_time) {
    try {
      const utcDate = new Date(`${event.event_date}T${event.event_time}Z`);
      timeStr = `⏰ ${escapeMarkdownV2(formatForUser(utcDate, userTimezone))}`;
    } catch (e) {
      timeStr = `⏰ ${escapeMarkdownV2(event.event_time)}`;
    }
  }

  return [
    `⚠️ *SẮP DIỄN RA TRONG ${minutesBefore} PHÚT*`,
    ``,
    `${emoji} *${escapeMarkdownV2(event.title)}*`,
    `💱 *${escapeMarkdownV2(event.currency)}* \\| ${timeStr}`,
    `📊 Dự báo: ${event.forecast ? escapeMarkdownV2(String(event.forecast)) : 'N/A'}`,
    `📈 Trước: ${event.previous ? escapeMarkdownV2(String(event.previous)) : 'N/A'}`,
    ``,
    `_Nguồn: ForexFactory_`,
  ].join('\n');
}

export function formatSettings(settings: UserSettings, user: any): string {
  const impactList = settings.impact_filter?.length
    ? settings.impact_filter.join(', ')
    : 'Không có';
    
  const currencyList = settings.currency_filter?.length
    ? settings.currency_filter.join(', ')
    : 'Tất cả';
  
  const status = user.is_active ? '✅ Đang hoạt động' : '❌ Chưa subscribe';
  const tz = settings.timezone || 'Asia/Ho_Chi_Minh';

  return (
    '⚙️ CÀI ĐẶT HIỆN TẠI\n' +
    '━━━━━━━━━━━━━━━━━━━━━━\n\n' +
    `📡 Trạng thái: ${status}\n\n` +
    `🌅 Bản tin sáng: ${settings.morning_enabled ? '✅ Bật' : '❌ Tắt'}\n` +
    `⏰ Giờ nhận bản tin: ${settings.morning_time ?? '08:00'} (${tz})\n\n` +
    `⚠️ Cảnh báo trước: ${settings.alert_enabled ? '✅ Bật' : '❌ Tắt'}\n` +
    `🔔 Thời gian báo trước: ${settings.alert_minutes ?? 15} phút\n\n` +
    `🕒 Múi giờ: ${tz}\n` +
    `   (Dùng /settimezone để thay đổi)\n\n` +
    `🎯 Mức độ tác động:\n  ${settings.impact_filter?.map(i => `• ${i}`).join('\n  ') ?? '• Không có'}\n\n` +
    `💱 Đồng tiền lọc: ${currencyList}\n\n` +
    '━━━━━━━━━━━━━━━━━━━━━━\n' +
    'Dùng /setimpact, /setcurrency, /settime, /setalert, /settimezone để thay đổi'
  );
}

export function formatEventList(events: DbEvent[], userTimezone: string): string {
  if (events.length === 0) {
    return `_Không có sự kiện nào được tìm thấy\\._`;
  }

  return events
    .map((e) => {
      const emoji = IMPACT_EMOJIS[e.impact] || 'ℹ️';
      let time = 'All Day';
      if (e.event_time) {
        try {
          time = formatUtcToLocal(e.event_time, userTimezone);
        } catch {
          time = e.event_time.slice(0, 5);
        }
      }
      let detail = `${emoji} \`${escapeMarkdownV2(time)}\` *${escapeMarkdownV2(e.currency)}* — ${escapeMarkdownV2(e.title)}`;
      if (e.actual) {
        detail += `\n    🎯 Thực tế: *${escapeMarkdownV2(String(e.actual))}*`;
      } else if (e.forecast) {
        detail += `\n    📊 Dự báo: ${escapeMarkdownV2(String(e.forecast))}`;
      }
      return detail;
    })
    .join('\n\n');
}
