import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { ParsedEvent, ImpactType } from '../events/events.types';
import { sleep } from '../common/utils/sleep.util';

interface FFJsonEvent {
  title: string;
  country: string;
  date: string;       // ISO 8601 with offset e.g. "2026-05-21T12:30:00-04:00"
  impact: string;
  forecast: string;
  previous: string;
  actual: string;
}

@Injectable()
export class ForexFactoryService {
  private circuitBreakerCount = 0;
  private readonly MAX_FAILURES = 3;

  constructor(
    private readonly httpService: HttpService,
    @InjectPinoLogger(ForexFactoryService.name)
    private readonly logger: PinoLogger,
  ) {}

  async fetchEvents(weekParam: 'this' | 'next' = 'this'): Promise<ParsedEvent[]> {
    if (this.circuitBreakerCount >= this.MAX_FAILURES) {
      this.logger.error('Circuit breaker OPEN — fetch disabled');
      throw new Error('Circuit breaker open: too many consecutive failures');
    }

    const url = weekParam === 'next'
      ? 'https://nfs.faireconomy.media/ff_calendar_nextweek.json'
      : 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

    // Small polite delay
    await sleep(500);

    try {
      const response = await this.httpService.axiosRef.get<FFJsonEvent[]>(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ForexNewsBot/1.0)',
          'Accept': 'application/json',
        },
      });

      const raw = response.data;
      if (!Array.isArray(raw)) {
        throw new Error('Unexpected response format: not an array');
      }

      const parsed = raw
        .map(item => this.mapEvent(item))
        .filter((e): e is ParsedEvent => e !== null);

      this.logger.info({ count: parsed.length, week: weekParam }, 'Fetched events from FF JSON API');
      this.circuitBreakerCount = 0;
      return parsed;

    } catch (err) {
      this.circuitBreakerCount++;
      this.logger.error({ err, attempt: this.circuitBreakerCount }, 'Failed to fetch FF JSON');
      throw err;
    }
  }

  private mapEvent(item: FFJsonEvent): ParsedEvent | null {
    try {
      if (!item.title || !item.country) return null;

      // Parse the ISO date string — it includes timezone offset
      const dateObj = parseISO(item.date);

      // Extract date and time in UTC
      const eventDate = formatInTimeZone(dateObj, 'UTC', 'yyyy-MM-dd');
      const eventTime = formatInTimeZone(dateObj, 'UTC', 'HH:mm');

      const impact = this.normalizeImpact(item.impact);
      if (!impact) return null;

      return {
        title: item.title.trim(),
        currency: item.country.trim().toUpperCase(),
        impact,
        eventDate,
        eventTime,
        forecast: item.forecast?.trim() || null,
        previous: item.previous?.trim() || null,
        actual: item.actual?.trim() || null,
      };
    } catch (err) {
      this.logger.warn({ item, err }, 'Failed to map event — skipping');
      return null;
    }
  }

  private normalizeImpact(raw: string): ImpactType | null {
    const map: Record<string, ImpactType> = {
      'high':    'High',
      'medium':  'Medium',
      'low':     'Low',
      'holiday': 'Holiday',
    };
    return map[raw?.toLowerCase()] ?? null;
  }
}
