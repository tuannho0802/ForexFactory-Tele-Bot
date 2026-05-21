import { Injectable, Logger } from '@nestjs/common';
import { EventsRepository } from './events.repository';
import { DbEvent, ParsedEvent, ScanSummary } from './events.types';
import { generateEventHash } from '../common/utils/hash.util';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly eventsRepository: EventsRepository) {}

  async processScanResults(events: ParsedEvent[], batchId: string): Promise<ScanSummary> {
    const newEvents: DbEvent[] = [];
    const updatedActuals: DbEvent[] = [];

    try {
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
          // New event completely
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
          const actualChanged = existing.actual !== event.actual;

          if (hadNoActual && hasActualNow) {
            // Updated actual value
            const updated = await this.eventsRepository.updateEventActual(existing.id, event.actual);
            updatedActuals.push(updated);
          } else if (actualChanged || existing.forecast !== event.forecast || existing.previous !== event.previous) {
            // Update other fields silently
            await this.eventsRepository.updateEventActual(existing.id, event.actual);
          }
        }
      }

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

  async getUpcomingEvents(fromUtc: Date, toUtc: Date): Promise<DbEvent[]> {
    try {
      return await this.eventsRepository.getUpcomingEvents(fromUtc, toUtc);
    } catch (error: any) {
      this.logger.error('Error in getUpcomingEvents', error.stack);
      throw error;
    }
  }

  async createScanLog(batchId: string, source?: string) {
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
  ) {
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
