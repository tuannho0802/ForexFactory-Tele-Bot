import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { DbEvent, ParsedEvent, ScanLog } from './events.types';

@Injectable()
export class EventsRepository {
  private readonly logger = new Logger(EventsRepository.name);

  constructor(private readonly supabase: SupabaseService) {}

  async insertEvent(event: Omit<DbEvent, 'id' | 'first_seen_at' | 'last_updated_at'>): Promise<DbEvent> {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('events')
        .insert({
          event_hash: event.event_hash,
          title: event.title,
          currency: event.currency,
          impact: event.impact,
          event_date: event.event_date,
          event_time: event.event_time,
          forecast: event.forecast,
          previous: event.previous,
          actual: event.actual,
          detail_url: event.detail_url,
          scan_batch_id: event.scan_batch_id,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as DbEvent;
    } catch (error: any) {
      this.logger.error(`Error in insertEvent for hash: ${event.event_hash}`, error.stack);
      throw error;
    }
  }

  async getEventByHash(hash: string): Promise<DbEvent | null> {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('events')
        .select('*')
        .eq('event_hash', hash)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data as DbEvent | null;
    } catch (error: any) {
      this.logger.error(`Error in getEventByHash for hash: ${hash}`, error.stack);
      throw error;
    }
  }

  async updateEventActual(id: string, actual: string | null): Promise<DbEvent> {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('events')
        .update({
          actual,
          last_updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as DbEvent;
    } catch (error: any) {
      this.logger.error(`Error in updateEventActual for id: ${id}`, error.stack);
      throw error;
    }
  }

  async getEventsByDate(date: string): Promise<DbEvent[]> {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('events')
        .select('*')
        .eq('event_date', date)
        .order('event_time', { ascending: true, nullsFirst: false });

      if (error) {
        throw error;
      }

      return data as DbEvent[];
    } catch (error: any) {
      this.logger.error(`Error in getEventsByDate for date: ${date}`, error.stack);
      throw error;
    }
  }

  async getUpcomingEvents(fromUtc: Date, toUtc: Date): Promise<DbEvent[]> {
    try {
      const client = this.supabase.getClient();

      const fromDateStr = fromUtc.toISOString().split('T')[0];
      const toDateStr = toUtc.toISOString().split('T')[0];

      const { data, error } = await client
        .from('events')
        .select('*')
        .gte('event_date', fromDateStr)
        .lte('event_date', toDateStr);

      if (error) {
        throw error;
      }

      const events = data as DbEvent[];

      // Filter events by precise UTC timestamp in memory
      return events.filter((e) => {
        if (!e.event_time) return false;
        const eventDateTime = new Date(`${e.event_date}T${e.event_time}Z`);
        return eventDateTime >= fromUtc && eventDateTime <= toUtc;
      });
    } catch (error: any) {
      this.logger.error('Error in getUpcomingEvents', error.stack);
      throw error;
    }
  }

  /**
   * Check if a scan is already running within the given time window.
   * Used as a Supabase-native distributed lock replacement.
   */
  async getRunningScans(withinMinutes: number): Promise<ScanLog | null> {
    try {
      const client = this.supabase.getClient();
      const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();

      const { data, error } = await client
        .from('scan_log')
        .select('*')
        .eq('status', 'running')
        .gte('started_at', cutoff)
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data as ScanLog | null;
    } catch (error: any) {
      this.logger.error('Error in getRunningScans', error.stack);
      // On DB error, return null to allow scan to proceed (fail-open)
      return null;
    }
  }

  async createScanLog(batchId: string, source = 'forexfactory'): Promise<ScanLog> {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('scan_log')
        .insert({
          batch_id: batchId,
          status: 'running',
          source,
          events_found: 0,
          events_new: 0,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as ScanLog;
    } catch (error: any) {
      this.logger.error(`Error creating scan log for batch: ${batchId}`, error.stack);
      throw error;
    }
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
    try {
      const client = this.supabase.getClient();
      const { error } = await client
        .from('scan_log')
        .update(updates)
        .eq('batch_id', batchId);

      if (error) {
        throw error;
      }
    } catch (error: any) {
      this.logger.error(`Error updating scan log for batch: ${batchId}`, error.stack);
      throw error;
    }
  }

  async getBotConfig(key: string): Promise<string | null> {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('bot_config')
        .select('value')
        .eq('key', key)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data ? data.value : null;
    } catch (error: any) {
      this.logger.error(`Error getting bot config for key: ${key}`, error.stack);
      return null;
    }
  }

  async checkNotificationLogExists(idempotencyKey: string): Promise<boolean> {
    try {
      const client = this.supabase.getClient();
      const { count, error } = await client
        .from('notification_log')
        .select('*', { count: 'exact', head: true })
        .eq('idempotency_key', idempotencyKey);

      if (error) {
        throw error;
      }

      return (count ?? 0) > 0;
    } catch (error: any) {
      this.logger.error(`Error checking notification log for key: ${idempotencyKey}`, error.stack);
      return false;
    }
  }

  async insertNotificationLog(log: {
    idempotency_key: string;
    user_id: string;
    event_id: string | null;
    type: 'new_event' | 'morning_briefing' | 'pre_alert' | 'actual_update';
    status: 'sent' | 'failed' | 'skipped';
    error_msg?: string | null;
  }): Promise<void> {
    try {
      const client = this.supabase.getClient();
      const { error } = await client
        .from('notification_log')
        .insert({
          idempotency_key: log.idempotency_key,
          user_id: log.user_id,
          event_id: log.event_id,
          type: log.type,
          status: log.status,
          error_msg: log.error_msg || null,
        });

      if (error) {
        throw error;
      }
    } catch (error: any) {
      this.logger.error(`Error inserting notification log for key: ${log.idempotency_key}`, error.stack);
    }
  }
}
