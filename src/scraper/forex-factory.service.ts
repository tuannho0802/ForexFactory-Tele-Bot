import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
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

    // Try Layer 1: JSON
    try {
      const events = await this.fetchFromJson(weekParam);
      if (events.length > 0) {
        this.circuitBreakerCount = 0;
        this.logger.info({ count: events.length, source: 'json' }, 'Fetched events');
        return events;
      }
    } catch (err: any) {
      this.logger.warn({ err: err.message }, 'JSON source failed, trying XML');
    }

    // Try Layer 2: XML
    try {
      const events = await this.fetchFromXml(weekParam);
      if (events.length > 0) {
        this.circuitBreakerCount = 0;
        this.logger.info({ count: events.length, source: 'xml' }, 'Fetched events');
        return events;
      }
    } catch (err: any) {
      this.logger.warn({ err: err.message }, 'XML source failed, trying HTML scrape');
    }

    // Try Layer 3: HTML scraping (reinstall cheerio if removed)
    try {
      const events = await this.fetchFromHtml();
      this.circuitBreakerCount = 0;
      this.logger.info({ count: events.length, source: 'html' }, 'Fetched events');
      return events;
    } catch (err: any) {
      this.circuitBreakerCount++;
      this.logger.error({ err: err.message, attempt: this.circuitBreakerCount }, 'All sources failed');
      throw err;
    }
  }

  private async fetchFromJson(weekParam: 'this' | 'next'): Promise<ParsedEvent[]> {
    const url = `https://nfs.faireconomy.media/ff_calendar_${weekParam}week.json`;
    await sleep(500);
    const { data } = await this.httpService.axiosRef.get<FFJsonEvent[]>(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    });
    if (!Array.isArray(data)) throw new Error('Not an array');
    return data.map(item => this.mapJsonEvent(item)).filter((e): e is ParsedEvent => e !== null);
  }

  private async fetchFromXml(weekParam: 'this' | 'next'): Promise<ParsedEvent[]> {
    const url = `https://nfs.faireconomy.media/ff_calendar_${weekParam}week.xml`;
    await sleep(500);
    const { data } = await this.httpService.axiosRef.get<string>(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/xml' },
    });
    
    const { XMLParser } = await import('fast-xml-parser');
    const parser = new XMLParser({ ignoreAttributes: false });
    const result = parser.parse(data);
    const events = result?.weeklyevents?.event ?? [];
    const arr = Array.isArray(events) ? events : [events];
    
    return arr.map((item: any) => this.mapXmlEvent(item)).filter((e): e is ParsedEvent => e !== null);
  }

  private mapJsonEvent(item: FFJsonEvent): ParsedEvent | null {
    try {
      // Ensure all string fields are actually strings to avoid [object Object]
      const title = typeof item.title === 'string' ? item.title.trim() : String(item.title ?? '');
      const country = typeof item.country === 'string' ? item.country.trim() : String(item.country ?? '');
      const forecast = typeof item.forecast === 'string' && item.forecast.trim() ? item.forecast.trim() : null;
      const previous = typeof item.previous === 'string' && item.previous.trim() ? item.previous.trim() : null;
      const actual = typeof item.actual === 'string' && item.actual.trim() ? item.actual.trim() : null;
      
      if (!title || !country) return null;

      // Parse the ISO date string — it includes timezone offset
      const dateObj = parseISO(item.date);

      // Extract date and time in UTC
      const eventDate = formatInTimeZone(dateObj, 'UTC', 'yyyy-MM-dd');
      const eventTime = formatInTimeZone(dateObj, 'UTC', 'HH:mm');

      const impact = this.normalizeImpact(item.impact);
      if (!impact) return null;

      return {
        title,
        currency: country.toUpperCase(),
        impact,
        eventDate,
        eventTime,
        forecast,
        previous,
        actual,
        detailUrl: null,
      };
    } catch (err) {
      this.logger.warn({ item, err }, 'Failed to map json event — skipping');
      return null;
    }
  }

  private mapXmlEvent(item: any): ParsedEvent | null {
    try {
      const title = String(item.title ?? '').trim();
      const currency = String(item.country ?? '').trim().toUpperCase();
      if (!title || !currency) return null;

      // XML date format: "05-21-2026" (MM-DD-YYYY)
      // XML time format: "8:30am" or "10:45pm" — this is ET
      const dateRaw = String(item.date ?? '').trim(); // "05-21-2026"
      const timeRaw = String(item.time ?? '').trim(); // "8:30am"

      // Parse MM-DD-YYYY → Date object
      const parts = dateRaw.split('-');
      if (parts.length !== 3) return null;
      const [month, day, year] = parts.map(Number);
      const impact = this.normalizeImpact(String(item.impact ?? ''));
      if (!impact) return null;

      // Parse time string "8:30am" / "10:45pm" in ET
      const eventUtc = this.parseXmlDateTime(year, month, day, timeRaw);
      const eventDate = formatInTimeZone(eventUtc, 'UTC', 'yyyy-MM-dd');
      const eventTime = formatInTimeZone(eventUtc, 'UTC', 'HH:mm');

      return {
        title,
        currency,
        impact,
        eventDate,
        eventTime,
        forecast: String(item.forecast ?? '').trim() || null,
        previous: String(item.previous ?? '').trim() || null,
        actual: null, // XML doesn't include actual
        detailUrl: String(item.url ?? '').trim() || null,
      };
    } catch {
      return null;
    }
  }

  private parseXmlDateTime(year: number, month: number, day: number, timeStr: string): Date {
    // timeStr format: "8:30am", "10:45pm", "12:00am"
    const match = timeStr.match(/^(\d+):(\d+)(am|pm)$/i);
    if (!match) {
      // All-day event — use midnight ET
      return fromZonedTime(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T00:00:00`, 'America/New_York');
    }
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3].toLowerCase();
    if (ampm === 'pm' && hours !== 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    const localDateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:00`;
    return fromZonedTime(localDateStr, 'America/New_York');
  }

  private parseHtmlDate(dateText: string): string | null {
    // Expected format: "Wed May 21"
    const currentYear = new Date().getFullYear();
    const parsed = new Date(`${dateText} ${currentYear}`);
    if (isNaN(parsed.getTime())) return null;
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${currentYear}-${month}-${day}`;
  }

  private async fetchFromHtml(): Promise<ParsedEvent[]> {
    // Reinstall cheerio if needed: npm install cheerio
    await sleep(500);
    const { data } = await this.httpService.axiosRef.get('https://www.forexfactory.com/calendar', {
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
      },
    });
    const cheerio = await import('cheerio');
    const $ = cheerio.load(data);
    const events: ParsedEvent[] = [];
    let currentDate: string | null = null;

    $('tr.calendar__row').each((_, row) => {
      const $row = $(row);
      const dateText = $row.find('td.calendar__date span.date').text().trim();
      if (dateText) {
        // Parse date like "Wed May 21" using current year
        const parsed = this.parseHtmlDate(dateText);
        if (parsed) currentDate = parsed;
      }
      if (!currentDate) return;

      const timeText = $row.find('td.calendar__time').text().trim();
      const currency = $row.find('td.calendar__currency').text().trim();
      const title = $row.find('td.calendar__event span.calendar__event-title').text().trim();
      const impactClass = $row.find('td.calendar__impact span').attr('class') ?? '';
      const forecast = $row.find('td.calendar__forecast').text().trim();
      const previous = $row.find('td.calendar__previous').text().trim();
      const actual = $row.find('td.calendar__actual').text().trim();

      if (!title || !currency) return;

      const impact = this.normalizeImpactFromHtmlClass(impactClass);
      if (!impact) return;

      const eventUtc = this.parseXmlDateTime(
        parseInt(currentDate.slice(0, 4)),
        parseInt(currentDate.slice(5, 7)),
        parseInt(currentDate.slice(8, 10)),
        timeText || '12:00am',
      );

      events.push({
        title,
        currency,
        impact,
        eventDate: formatInTimeZone(eventUtc, 'UTC', 'yyyy-MM-dd'),
        eventTime: formatInTimeZone(eventUtc, 'UTC', 'HH:mm'),
        forecast: forecast || null,
        previous: previous || null,
        actual: actual || null,
        detailUrl: null,
      });
    });

    return events;
  }

  private normalizeImpactFromHtmlClass(cls: string): 'High' | 'Medium' | 'Low' | 'Holiday' | null {
    if (cls.includes('high')) return 'High';
    if (cls.includes('medium')) return 'Medium';
    if (cls.includes('low')) return 'Low';
    if (cls.includes('holiday')) return 'Holiday';
    return null;
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
