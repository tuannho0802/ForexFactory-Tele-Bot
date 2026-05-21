import { Injectable, Logger } from '@nestjs/common';
import { EventsRepository } from './events.repository';
import { DbEvent, ParsedEvent, ScanLog, ScanSummary } from './events.types';
import { generateEventHash } from '../common/utils/hash.util';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly eventsRepository: EventsRepository) {}

  async processScanResults(events: ParsedEvent[], batchId: string): Promise<ScanSummary> {
    const newEvents: DbEvent[] = [];
    const updatedActuals: DbEvent[] = [];

    try {
      this.logger.debug({ total: events.length }, '💾 Attempting to save events to DB');
      
      const sample = events.slice(0, 5).map(e => ({
        title: e.title,
        currency: e.currency,
        impact: e.impact,
        eventDate: e.eventDate,
        eventTime: e.eventTime,
      }));
      this.logger.debug({ sample }, '📋 Sample events being saved to DB');
      
      const dateCounts: Record<string, number> = {};
      for (const event of events) {
        dateCounts[event.eventDate] = (dateCounts[event.eventDate] || 0) + 1;
      }
      this.logger.debug({ dateCounts }, '📅 Event date distribution');
      
      const impactCounts: Record<string, number> = {};
      for (const event of events) {
        impactCounts[event.impact] = (impactCounts[event.impact] || 0) + 1;
      }
      this.logger.debug({ impactCounts }, '🎯 Impact distribution');

      this.logger.log(`Processing ${events.length} parsed events for batch: ${batchId}`);

      for (const event of events) {
        const eventTimeVal = event.eventTime || 'all-day';
        const hash = generateEventHash({
          currency: event.currency,
          title: event.title,
          eventDate: event.eventDate,
          eventTime: eventTimeVal,
        });

        const existing = await this.eventsRepository.getEventByHash(hash);

        if (!existing) {
          // New event
          const inserted = await this.eventsRepository.insertEvent({
            event_hash: hash,
            title: event.title,
            currency: event.currency,
            impact: event.impact,
            event_date: event.eventDate,
            event_time: event.eventTime,
            forecast: event.forecast,
            previous: event.previous,
            actual: event.actual,
            detail_url: event.detailUrl || null,
            scan_batch_id: batchId,
          });
          newEvents.push(inserted);
        } else {
          // Check actual value updates
          const hadNoActual = !existing.actual;
          const hasActualNow = !!event.actual;

          if (hadNoActual && hasActualNow) {
            const updated = await this.eventsRepository.updateEventActual(existing.id, event.actual);
            updatedActuals.push(updated);
          } else if (existing.actual !== event.actual || existing.forecast !== event.forecast || existing.previous !== event.previous) {
            // Update other fields silently (no notification)
            await this.eventsRepository.updateEventActual(existing.id, event.actual);
          }
        }
      }

      this.logger.debug({ saved: events.length }, '✅ Events saved to DB');
      this.logger.log(
        `Scan result processing complete. New: ${newEvents.length}, Updated actuals: ${updatedActuals.length}`
      );
      return { newEvents, updatedActuals };
    } catch (error: any) {
      this.logger.error(`Error in processScanResults for batch: ${batchId}`, error.stack);
      throw error;
    }
  }

  async getEventsByDate(date: string): Promise<DbEvent[]> {
    try {
      return await this.eventsRepository.getEventsByDate(date);
    } catch (error: any) {
      this.logger.error(`Error in getEventsByDate for date: ${date}`, error.stack);
      throw error;
    }
  }

  async countEventsByDate(date: string): Promise<number> {
    return await this.eventsRepository.countEventsByDate(date);
  }

  async countAll(): Promise<number> {
    return await this.eventsRepository.countAll();
  }

  async countAllEvents(): Promise<number> {
    return this.countAll();
  }

  async getDistinctDates(): Promise<string[]> {
    return await this.eventsRepository.getDistinctDates();
  }

  async getUpcomingEvents(fromUtc: Date, toUtc: Date): Promise<DbEvent[]> {
    try {
      return await this.eventsRepository.getUpcomingEvents(fromUtc, toUtc);
    } catch (error: any) {
      this.logger.error('Error in getUpcomingEvents', error.stack);
      throw error;
    }
  }

  /**
   * Check if a scan is already running within the last N minutes.
   * Used as a Supabase-native distributed lock.
   */
  async getRunningScans(withinMinutes: number): Promise<ScanLog | null> {
    return await this.eventsRepository.getRunningScans(withinMinutes);
  }

  async createScanLog(batchId: string, source?: string): Promise<ScanLog> {
    return await this.eventsRepository.createScanLog(batchId, source);
  }

  async updateScanLog(
    batchId: string,
    updates: {
      status: 'success' | 'failed';
      finished_at: string;
      events_found?: number;
      events_new?: number;
      error_msg?: string | null;
    }
  ): Promise<void> {
    return await this.eventsRepository.updateScanLog(batchId, updates);
  }

  async getBotConfig(key: string): Promise<string | null> {
    return await this.eventsRepository.getBotConfig(key);
  }

  async checkNotificationLogExists(idempotencyKey: string): Promise<boolean> {
    return await this.eventsRepository.checkNotificationLogExists(idempotencyKey);
  }

  async insertNotificationLog(log: {
    idempotency_key: string;
    user_id: string;
    event_id: string | null;
    type: 'new_event' | 'morning_briefing' | 'pre_alert' | 'actual_update';
    status: 'sent' | 'failed' | 'skipped';
    error_msg?: string | null;
  }): Promise<void> {
    return await this.eventsRepository.insertNotificationLog(log);
  }
}
