import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';
import { ParsedEvent, ImpactType } from '../events/events.types';
import { sleep } from '../common/utils/sleep.util';
import { getTodayUTC } from '../common/utils/time.util';
import { Cron, CronExpression } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';

interface FFJsonEvent {
  title: string;
  country: string;
  impact: string;
  date: string;     // "2026-05-21T03:15:00-04:00"
  time?: string;
  forecast?: string;
  previous?: string;
  actual?: string;
  url?: string;
}

interface CacheEntry {
  data: ParsedEvent[];
  timestamp: number;
  source: 'json' | 'xml' | 'html';
}

@Injectable()
export class ForexFactoryService {
  private readonly logger = new Logger(ForexFactoryService.name);
  
  // Cache với TTL 55 phút (an toàn dưới giới hạn rate limit)
  private eventCache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 55 * 60 * 1000; // 55 phút
  private readonly RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 phút
  private requestTimestamps: number[] = [];
  private readonly MAX_REQUESTS_PER_WINDOW = 2;

  constructor(
    private readonly httpService: HttpService,
  ) {}

  /**
   * Kiểm tra rate limit trước khi gọi API
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Xóa các timestamp cũ hơn 5 phút
    this.requestTimestamps = this.requestTimestamps.filter(
      ts => now - ts < this.RATE_LIMIT_WINDOW
    );
    
    if (this.requestTimestamps.length >= this.MAX_REQUESTS_PER_WINDOW) {
      const oldestInWindow = this.requestTimestamps[0];
      const waitTime = this.RATE_LIMIT_WINDOW - (now - oldestInWindow) + 1000;
      
      this.logger.warn(
        { waitTime: Math.ceil(waitTime / 1000) + 's' },
        '⏳ Rate limit approaching, waiting...'
      );
      
      await sleep(waitTime);
    }
    
    this.requestTimestamps.push(Date.now());
  }

  /**
   * Lấy events từ cache hoặc fetch mới
   */
  async fetchEvents(weekParam: 'this' | 'next' = 'this'): Promise<ParsedEvent[]> {
    const cacheKey = `week_${weekParam}`;
    const cached = this.eventCache.get(cacheKey);
    
    // Trả về cache nếu còn valid
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      this.logger.debug(
        { age: Math.round((Date.now() - cached.timestamp) / 1000) + 's', source: cached.source },
        '📦 Serving from cache'
      );
      return cached.data;
    }
    
    try {
      await this.checkRateLimit();
      
      // Layer 1: JSON API
      let events = await this.fetchFromJson(weekParam);
      let source = 'json';
      
      // Layer 2: XML fallback
      if (!events || events.length === 0) {
        this.logger.warn('JSON source returned empty, trying XML...');
        await this.checkRateLimit();
        events = await this.fetchFromXml(weekParam);
        source = 'xml';
      }
      
      // Layer 3: HTML scraping (last resort)
      if (!events || events.length === 0) {
        this.logger.warn('XML source also empty, falling back to HTML scraping...');
        events = await this.fetchFromHtml();
        source = 'html';
      }
      
      if (events && events.length > 0) {
        // Cập nhật cache
        this.eventCache.set(cacheKey, {
          data: events,
          timestamp: Date.now(),
          source: source as 'json' | 'xml' | 'html'
        });
        
        this.logger.log(
          `✅ Successfully fetched events. Count: ${events.length}, Source: ${source}`
        );
      }
      
      return events;
      
    } catch (error) {
      this.logger.error('❌ All data sources failed', error);
      
      // Trả về cache cũ nếu có, kể cả đã hết hạn
      if (cached) {
        this.logger.warn('⚠️ Returning stale cache as fallback');
        return cached.data;
      }
      
      throw error;
    }
  }

  /**
   * Reset cache định kỳ để đảm bảo dữ liệu luôn mới
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleCacheRefresh() {
    this.logger.debug('🔄 Cache refresh triggered');
    this.eventCache.clear();
    try {
      await this.fetchEvents('this');
    } catch (e) {
      this.logger.error('Background cache refresh failed', e);
    }
  }

  // Hàm validate schema trước khi parse
  private validateFFJsonSchema(events: any[]): boolean {
    if (!Array.isArray(events) || events.length === 0) return false;
    
    const firstEvent = events[0];
    const requiredFields = ['title', 'country', 'impact', 'date'];
    const missingFields = requiredFields.filter(field => 
      !(field in firstEvent) || firstEvent[field] === undefined
    );
    
    if (missingFields.length > 0) {
      this.logger.warn(
        `⚠️ FF JSON schema may have changed! Missing required fields: ${missingFields.join(', ')}. Sample: ${JSON.stringify(firstEvent).slice(0, 200)}`
      );
      return false;
    }
    
    return true;
  }

  private async fetchFromJson(weekParam: 'this' | 'next'): Promise<ParsedEvent[]> {
    const url = `https://nfs.faireconomy.media/ff_calendar_${weekParam}week.json`;
    
    this.logger.debug({ url }, '🌐 Fetching JSON from ForexFactory');
    
    try {
      const { data } = await this.httpService.axiosRef.get<any[]>(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
      });
      
      if (!Array.isArray(data)) {
        this.logger.error({ dataType: typeof data }, '❌ JSON response is not an array!');
        throw new Error('JSON response is not an array');
      }

      this.logger.debug({
        length: data.length,
        keys: data.length > 0 ? Object.keys(data[0]) : [],
      }, '📦 JSON fetched — schema check');
      
      if (!this.validateFFJsonSchema(data)) {
        this.logger.warn('JSON schema validation failed or array is empty.');
        return [];
      }
      
      const events = data
        .map((item) => this.mapJsonEvent(item))
        .filter((e): e is ParsedEvent => e !== null);
      
      this.logger.debug({
        total: data.length,
        parsed: events.length,
        dropped: data.length - events.length,
      }, '📊 PARSE SUMMARY');
      
      return events;
    } catch (err: any) {
      this.logger.error(`fetchFromJson error: ${err.message}`);
      return [];
    }
  }

  private async fetchFromXml(weekParam: 'this' | 'next'): Promise<ParsedEvent[]> {
    const url = `https://nfs.faireconomy.media/ff_calendar_${weekParam}week.xml`;
    try {
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
    } catch (err: any) {
      this.logger.error(`fetchFromXml error: ${err.message}`);
      return [];
    }
  }

  private parseEventDateTime(dateStr: string, timeStr: string, tz: string): Date | null {
    // timeStr format: "8:30am", "10:45pm", "12:00am", or "All Day"
    let hours = 0;
    let minutes = 0;
    
    if (timeStr && timeStr.toLowerCase() !== 'all day') {
      const match = timeStr.match(/^(\d+):(\d+)(am|pm)$/i);
      if (match) {
        hours = parseInt(match[1], 10);
        minutes = parseInt(match[2], 10);
        const ampm = match[3].toLowerCase();
        if (ampm === 'pm' && hours !== 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
      }
    }
    
    const localDateStr = `${dateStr}T${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:00`;
    return fromZonedTime(localDateStr, tz);
  }

  private async fetchFromHtml(): Promise<ParsedEvent[]> {
    try {
      const url = 'https://www.forexfactory.com/calendar?week=this';
      
      const { data } = await firstValueFrom(
        this.httpService.get(url, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
          },
        })
      );
      
      const cheerio = await import('cheerio');
      const $ = cheerio.load(data);
      const events: ParsedEvent[] = [];
      let _currentScrapeDate: string | null = null;
      
      // Selector MỚI cho cấu trúc HTML hiện tại
      $('tr.calendar__row').each((_, row) => {
        const $row = $(row);
        
        // Lấy ngày từ row header
        const dateText = $row.find('td.calendar__date span.date').text().trim();
        if (dateText) {
          // Parse "Thu May 21" format
          const today = new Date();
          const parsedDate = new Date(`${dateText} ${today.getFullYear()}`);
          if (!isNaN(parsedDate.getTime())) {
            _currentScrapeDate = format(parsedDate, 'yyyy-MM-dd');
          }
        }
        
        const timeText = $row.find('td.calendar__time').text().trim();
        const currency = $row.find('td.calendar__currency').text().trim().toUpperCase();
        const title = $row.find('td.calendar__event span.calendar__event-title').text().trim();
        
        // Xác định impact từ class MỚI
        const impactSpan = $row.find('td.calendar__impact span');
        const impactClass = impactSpan.attr('class') || '';
        let impact: string | null = null;
        
        if (impactClass.includes('icon--ff-impact-red') || impactClass.includes('high')) {
          impact = 'High';
        } else if (impactClass.includes('icon--ff-impact-orange') || impactClass.includes('medium')) {
          impact = 'Medium';
        } else if (impactClass.includes('icon--ff-impact-grey') || impactClass.includes('low')) {
          impact = 'Low';
        } else if (impactClass.includes('icon--ff-impact-none') || impactClass.includes('holiday')) {
          impact = 'Holiday';
        }
        
        if (!currency || !title || !impact) return;
        
        const forecast = $row.find('td.calendar__forecast').text().trim() || null;
        const previous = $row.find('td.calendar__previous').text().trim() || null;
        const actual = $row.find('td.calendar__actual').text().trim() || null;
        
        // Parse thời gian sự kiện (ET timezone)
        const eventDateTime = this.parseEventDateTime(
          _currentScrapeDate || format(new Date(), 'yyyy-MM-dd'),
          timeText,
          'America/New_York'
        );
        
        if (!eventDateTime) return;
        
        events.push({
          title,
          currency,
          impact: impact as 'High' | 'Medium' | 'Low' | 'Holiday',
          eventDate: formatInTimeZone(eventDateTime, 'UTC', 'yyyy-MM-dd'),
          eventTime: formatInTimeZone(eventDateTime, 'UTC', 'HH:mm'),
          forecast,
          previous,
          actual,
          detailUrl: null,
        });
      });
      
      this.logger.log(`📊 HTML scraping completed. Count: ${events.length}`);
      return events;
      
    } catch (error) {
      this.logger.error('❌ HTML scraping failed', error);
      return [];
    }
  }

  private mapJsonEvent(item: any): ParsedEvent | null {
    try {
      const title = typeof item.title === 'string' ? item.title.trim() : String(item.title ?? '');
      const country = typeof item.country === 'string' ? item.country.trim() : String(item.country ?? '');
      const dateRaw = typeof item.date === 'string' ? item.date.trim() : String(item.date ?? '');
      const impactRaw = typeof item.impact === 'string' ? item.impact.trim() : String(item.impact ?? '');
      
      if (!title || !country) {
        this.logger.warn({ title, country }, '⚠️ Skipping event: missing title or country');
        return null;
      }

      if (!dateRaw) {
        this.logger.warn({ title, country }, '⚠️ Skipping event: missing date');
        return null;
      }

      let eventDate: string;
      let eventTime: string;

      try {
        const parsedDate = new Date(dateRaw);
        if (isNaN(parsedDate.getTime())) {
          eventDate = dateRaw.split('T')[0];
          eventTime = '00:00';
        } else {
          eventDate = formatInTimeZone(parsedDate, 'UTC', 'yyyy-MM-dd');
          eventTime = formatInTimeZone(parsedDate, 'UTC', 'HH:mm');
        }
      } catch (err) {
        this.logger.error({ dateRaw }, '❌ Failed to parse date');
        return null;
      }

      const impact = this.normalizeImpact(impactRaw);
      if (!impact) {
        this.logger.warn({ title, impactRaw }, '⚠️ Skipping event: unrecognized impact value');
        return null;
      }

      return {
        title,
        currency: country.toUpperCase(),
        impact: impact as any,
        eventDate,
        eventTime,
        forecast: typeof item.forecast === 'string' && item.forecast.trim() ? item.forecast.trim() : null,
        previous: typeof item.previous === 'string' && item.previous.trim() ? item.previous.trim() : null,
        actual: typeof item.actual === 'string' && item.actual.trim() ? item.actual.trim() : null,
        detailUrl: typeof item.url === 'string' ? item.url.trim() : null,
      };
    } catch (err) {
      this.logger.error({ err, item: JSON.stringify(item).slice(0, 300) }, '❌ mapJsonEvent - Exception');
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

  private normalizeImpact(impactRaw: string): ImpactType | null {
    if (!impactRaw && impactRaw !== '0') return null;
    
    const impact = impactRaw.toString().trim();
    
    this.logger.debug({ impactRaw: impact }, '🎯 normalizeImpact input');
    
    if (/^\d+$/.test(impact)) {
      const num = parseInt(impact, 10);
      switch (num) {
        case 3: return 'High';
        case 2: return 'Medium';
        case 1: return 'Low';
        case 0: return 'Holiday';
        default: return null;
      }
    }
    
    const lower = impact.toLowerCase();
    
    if (lower.includes('high') || lower.includes('red') || lower === '3') {
      return 'High';
    }
    if (lower.includes('medium') || lower.includes('orange') || lower === '2') {
      return 'Medium';
    }
    if (lower.includes('low') || lower.includes('grey') || lower.includes('gray') || lower === '1') {
      return 'Low';
    }
    if (lower.includes('non') || lower.includes('none') || lower.includes('holiday') || lower === '0') {
      return 'Holiday';
    }
    
    this.logger.warn({ impactRaw: impact }, '⚠️ Unrecognized impact value');
    return null;
  }

  async debugFetchAllSources(): Promise<Record<string, any>> {
    const today = getTodayUTC();
    const results: Record<string, any> = {};
    
    try {
      const jsonEvents = await this.fetchFromJson('this');
      results['json'] = {
        count: jsonEvents.length,
        todayCount: jsonEvents.filter(e => e.eventDate === today).length,
        sample: jsonEvents.length > 0 ? jsonEvents[0].title : null
      };
    } catch (e: any) { results['json'] = { error: e.message }; }

    try {
      const xmlEvents = await this.fetchFromXml('this');
      results['xml'] = {
        count: xmlEvents.length,
        todayCount: xmlEvents.filter(e => e.eventDate === today).length,
        sample: xmlEvents.length > 0 ? xmlEvents[0].title : null
      };
    } catch (e: any) { results['xml'] = { error: e.message }; }

    try {
      const htmlEvents = await this.fetchFromHtml();
      results['html'] = {
        count: htmlEvents.length,
        todayCount: htmlEvents.filter(e => e.eventDate === today).length,
        sample: htmlEvents.length > 0 ? htmlEvents[0].title : null
      };
    } catch (e: any) { results['html'] = { error: e.message }; }

    return results;
  }
}
