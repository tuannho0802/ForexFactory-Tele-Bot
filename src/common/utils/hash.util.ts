import { createHash } from 'crypto';

export function generateEventHash(params: {
  currency: string;
  title: string;
  eventDate: string;  // YYYY-MM-DD
  eventTime: string;  // HH:MM or 'all-day'
}): string {
  const raw = `${params.currency.trim()}|${params.title.toLowerCase().trim()}|${params.eventDate.trim()}|${params.eventTime.trim()}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}
