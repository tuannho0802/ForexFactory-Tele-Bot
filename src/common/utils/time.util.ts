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

/**
 * Get today's date string (yyyy-MM-dd) in the user's timezone.
 * If no timezone provided, falls back to UTC.
 */
export function getTodayInTimezone(timezone?: string): string {
  const tz = timezone || 'UTC';
  return formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');
}

/**
 * Convert a UTC date and time to a Date object in the given timezone.
 * Handles event_time with or without seconds (HH:mm or HH:mm:ss).
 * Returns null if input is invalid.
 */
export function getEventDateTimeInTimezone(
  eventDate: string | null | undefined,
  eventTime: string | null | undefined,
  timezone: string
): Date | null {
  // Validate inputs
  if (!eventDate || !eventTime || !timezone) {
    console.warn('[getEventDateTimeInTimezone] Missing input', { eventDate, eventTime, timezone });
    return null;
  }

  // Ensure event_time is in HH:mm format (strip seconds if present)
  let timePart = eventTime.trim();
  if (timePart.length > 5) {
    // If it contains seconds (e.g., "00:30:00"), take only HH:mm
    timePart = timePart.substring(0, 5);
  }

  // Construct valid ISO 8601 string: yyyy-MM-ddTHH:mmZ
  const isoString = `${eventDate.trim()}T${timePart}:00Z`;
  
  const date = toZonedTime(isoString, timezone);
  
  if (isNaN(date.getTime())) {
    console.warn('[getEventDateTimeInTimezone] Invalid date', { isoString, timezone });
    return null;
  }
  
  return date;
}

/**
 * Determine if an event falls on a specific date in the given timezone.
 * Returns false if any input is invalid (safe to use in array.filter).
 */
export function isEventOnDate(
  eventDate: string | null | undefined,
  eventTime: string | null | undefined,
  targetDate: string,
  timezone: string
): boolean {
  // Quick null/undefined check
  if (!eventDate || !eventTime) {
    return false;
  }

  try {
    const eventZoned = getEventDateTimeInTimezone(eventDate, eventTime, timezone);
    if (!eventZoned) return false;
    
    const formatted = formatInTimeZone(eventZoned, timezone, 'yyyy-MM-dd');
    return formatted === targetDate;
  } catch (err) {
    console.error('[isEventOnDate] Error processing event', {
      eventDate,
      eventTime,
      targetDate,
      timezone,
      err,
    });
    return false;
  }
}
