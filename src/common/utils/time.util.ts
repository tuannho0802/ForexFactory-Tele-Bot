import { toZonedTime, fromZonedTime, format, formatInTimeZone } from 'date-fns-tz';

export function toUtcTime(localTime: string, localDate: string, sourceTimezone: string = 'America/New_York'): Date {
  const localDateTime = `${localDate}T${localTime}:00`;
  return fromZonedTime(localDateTime, sourceTimezone);
}

export function formatForUser(utcDate: Date, userTimezone: string): string {
  const zoned = toZonedTime(utcDate, userTimezone);
  return format(zoned, 'HH:mm dd/MM', { timeZone: userTimezone });
}

export function formatUtcToLocal(utcTimeStr: string, userTimezone: string): string {
  // utcTimeStr represents a time, e.g. "13:30:00" or a full datetime
  // If it's just a time like "13:30:00", we can append today's date in UTC, convert to zoned time, and format
  if (utcTimeStr.includes(':')) {
    const parts = utcTimeStr.split(':');
    const nowUtc = new Date();
    const utcDate = new Date(Date.UTC(
      nowUtc.getUTCFullYear(),
      nowUtc.getUTCMonth(),
      nowUtc.getUTCDate(),
      parseInt(parts[0], 10),
      parseInt(parts[1], 10),
      parts[2] ? parseInt(parts[2], 10) : 0
    ));
    const zoned = toZonedTime(utcDate, userTimezone);
    return format(zoned, 'HH:mm');
  }
  return utcTimeStr;
}

export function getTodayUTC(): string {
  const now = new Date();
  const todayUtc = formatInTimeZone(now, 'UTC', 'yyyy-MM-dd');
  
  console.log(`[TIME UTIL] getTodayUTC() called:
  - now.toISOString(): ${now.toISOString()}
  - now.toString(): ${now.toString()}
  - todayUtc: ${todayUtc}`);
  
  return todayUtc;
}

export function getNowUTC(): Date {
  return new Date(); // JS Date is always UTC internally
}
