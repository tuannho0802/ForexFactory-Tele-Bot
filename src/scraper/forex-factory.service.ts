import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import * as cheerio from 'cheerio';
import { RedisService } from '../redis/redis.service';
import { ParsedEvent, ImpactType } from '../events/events.types';
import { sleep } from '../common/utils/sleep.util';
import { toUtcTime } from '../common/utils/time.util';

export class ScrapingCircuitOpenError extends Error {
  constructor() {
    super('Scraping circuit breaker is OPEN — Scraping is temporarily disabled');
    this.name = 'ScrapingCircuitOpenError';
  }
}

@Injectable()
export class ForexFactoryService {
  private readonly logger = new Logger(ForexFactoryService.name);
  private circuitBreakerCount = 0;
  private readonly MAX_FAILURES = 3;

  constructor(
    private readonly httpService: HttpService,
    private readonly redisService: RedisService
  ) {}

  async fetchEvents(weekParam: 'this' | 'next' = 'this'): Promise<ParsedEvent[]> {
    // 1. Check circuit breaker
    if (this.circuitBreakerCount >= this.MAX_FAILURES) {
      this.logger.error('Circuit breaker is OPEN — scraping disabled');
      throw new ScrapingCircuitOpenError();
    }

    // 2. Check cache (expires after 55 minutes)
    const cacheKey = `scrape:ff:${weekParam}:${new Date().toISOString().slice(0, 13)}`;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        this.logger.log(`Returning cached scrape results for week: ${weekParam}`);
        return typeof cached === 'string' ? JSON.parse(cached) : cached;
      }
    } catch (cacheError: any) {
      this.logger.error('Failed to access Redis cache, proceeding with scrape', cacheError.stack);
    }

    // 3. Add random delay 2000-5000ms
    const delay = Math.floor(Math.random() * 3000) + 2000;
    this.logger.log(`Delaying scrape request by ${delay}ms...`);
    await sleep(delay);

    try {
      this.logger.log(`Fetching ForexFactory calendar HTML for week: ${weekParam}...`);
      const html = await this.fetchWithRetry(weekParam);
      const parsed = this.parseHTML(html);

      // 4. Validate and filter results
      const validated = parsed.filter((e) => this.isValidEvent(e));

      // 5. Cache results for 55 minutes (3300 seconds)
      try {
        await this.redisService.setex(cacheKey, 3300, JSON.stringify(validated));
      } catch (cacheSetError: any) {
        this.logger.error('Failed to save scrape results to cache', cacheSetError.stack);
      }

      // Reset circuit breaker on success
      this.circuitBreakerCount = 0;
      this.logger.log(`Successfully scraped ${validated.length} events from ForexFactory`);
      return validated;
    } catch (err: any) {
      this.circuitBreakerCount++;
      this.logger.error(
        `Scrape failed. Circuit breaker count: ${this.circuitBreakerCount}/${this.MAX_FAILURES}`,
        err.stack
      );
      throw err;
    }
  }

  private async fetchWithRetry(weekParam: string, attempt = 1): Promise<string> {
    const url = `https://www.forexfactory.com/calendar?week=${weekParam}`;
    try {
      const response = await this.httpService.axiosRef.get(url, {
        headers: this.getRandomHeaders(),
        timeout: 15000,
      });
      return response.data;
    } catch (err: any) {
      this.logger.warn(`Scrape attempt ${attempt} failed: ${err.message}`);
      if (attempt < 3) {
        const backoff = attempt * 3000; // 3s, 6s
        this.logger.log(`Retrying in ${backoff}ms...`);
        await sleep(backoff);
        return this.fetchWithRetry(weekParam, attempt + 1);
      }
      throw err;
    }
  }

  private parseHTML(html: string): ParsedEvent[] {
    const $ = cheerio.load(html);
    const events: ParsedEvent[] = [];
    let currentDate: string | null = null;

    $('tr.calendar__row').each((_, row) => {
      const $row = $(row);

      // ForexFactory only prints date once per day in the first row of that day
      const dateCell = $row.find('td.calendar__date').text().trim();
      if (dateCell) {
        const parsedDate = this.parseFFDate(dateCell);
        if (parsedDate) {
          currentDate = parsedDate;
        }
      }

      if (!currentDate) return;

      const time = $row.find('td.calendar__time').text().trim();
      const currency = $row.find('td.calendar__currency').text().trim();
      const impactClass = $row.find('td.calendar__impact span').attr('class') ?? '';
      const title = $row.find('td.calendar__event').text().trim();
      const forecast = $row.find('td.calendar__forecast').text().trim();
      const previous = $row.find('td.calendar__previous').text().trim();
      const actual = $row.find('td.calendar__actual').text().trim();
      const detailUrl = $row.find('td.calendar__event a').attr('href') ?? null;

      if (!title || !currency) return;

      const parsedTime = this.parseTime(time);
      const impact = this.parseImpact(impactClass);

      let eventDate = currentDate;
      let eventTime = parsedTime;

      // Handle timezone conversion if time is present
      if (parsedTime) {
        try {
          // ForexFactory defaults to America/New_York (Eastern Time)
          const utcDate = toUtcTime(parsedTime, currentDate, 'America/New_York');
          eventDate = utcDate.toISOString().split('T')[0];
          eventTime = utcDate.toISOString().split('T')[1].slice(0, 5); // HH:MM
        } catch (tzError: any) {
          this.logger.error(`Error converting timezone for ${currentDate} ${parsedTime}`, tzError.stack);
        }
      }

      events.push({
        title,
        currency,
        impact,
        eventDate,
        eventTime,
        forecast: forecast || null,
        previous: previous || null,
        actual: actual || null,
        detailUrl: detailUrl ? `https://www.forexfactory.com/${detailUrl}` : null,
      });
    });

    return events;
  }

  private parseFFDate(dateStr: string): string | null {
    const clean = dateStr.replace(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+/, '').trim();
    if (!clean) return null;
    const parts = clean.split(/\s+/);
    if (parts.length < 2) return null;

    const monthMap: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    };

    const monthName = parts[0];
    const dayStr = parts[1];

    const month = monthMap[monthName.slice(0, 3)];
    if (month === undefined) return null;

    const day = parseInt(dayStr, 10);
    if (isNaN(day)) return null;

    const now = new Date();
    let year = now.getFullYear();
    const currentMonth = now.getMonth();

    // Adjust year boundary if needed
    if (month === 0 && currentMonth === 11) {
      year += 1;
    } else if (month === 11 && currentMonth === 0) {
      year -= 1;
    }

    const monthPad = String(month + 1).padStart(2, '0');
    const dayPad = String(day).padStart(2, '0');
    return `${year}-${monthPad}-${dayPad}`;
  }

  private parseTime(timeStr: string): string | null {
    const clean = timeStr.toLowerCase().trim();
    if (clean === 'all day' || clean === 'tentative' || !clean) {
      return null;
    }

    const match = clean.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const ampm = match[3];

    if (ampm === 'pm' && hours < 12) {
      hours += 12;
    } else if (ampm === 'am' && hours === 12) {
      hours = 0;
    }

    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }

  private parseImpact(impactClass: string): ImpactType {
    const cls = impactClass.toLowerCase();
    if (cls.includes('red') || cls.includes('high')) return 'High';
    if (cls.includes('ora') || cls.includes('medium')) return 'Medium';
    if (cls.includes('yel') || cls.includes('low')) return 'Low';
    if (cls.includes('gra') || cls.includes('holiday') || cls.includes('white')) return 'Holiday';
    return 'Low';
  }

  private isValidEvent(event: ParsedEvent): boolean {
    return !!event.title && !!event.currency && !!event.eventDate;
  }

  private getRandomHeaders() {
    const agents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    ];
    return {
      'User-Agent': agents[Math.floor(Math.random() * agents.length)],
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.google.com/',
      'Cache-Control': 'no-cache',
    };
  }
}
