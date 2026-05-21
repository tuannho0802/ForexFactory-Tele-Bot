import { Injectable, Logger } from '@nestjs/common';
import { ForexFactoryService } from '../scraper/forex-factory.service';
import { EventsService } from '../events/events.service';
import { NotificationService } from '../notification/notification.service';
import { TelegramSenderService } from '../telegram/telegram-sender.service';
import { ConfigService } from '@nestjs/config';
import { escapeMarkdownV2 } from '../common/utils/string.util';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly forexFactoryService: ForexFactoryService,
    private readonly eventsService: EventsService,
    private readonly notificationService: NotificationService,
    private readonly telegramSender: TelegramSenderService,
    private readonly configService: ConfigService
  ) {}

  async handleScan(): Promise<{ success: boolean; batchId?: string; error?: string }> {
    // ── Distributed lock via scan_log ──────────────────────────────────────
    // If a scan row with status='running' exists within the last 5 minutes,
    // another instance is already working — skip to prevent duplicate runs.
    const running = await this.eventsService.getRunningScans(5);
    if (running) {
      this.logger.warn(
        `Scan already running (batch: ${running.batch_id}, started: ${running.started_at}) — skipping`
      );
      return { success: false, error: 'Scan already running' };
    }

    const batchId = `batch-${Date.now()}`;
    this.logger.log(`Starting economic calendar scan. Batch ID: ${batchId}`);

    // Insert scan_log row with status='running' — this IS the lock
    const scanLog = await this.eventsService.createScanLog(batchId, 'forexfactory');

    try {
      // 1. Fetch events from ForexFactory
      const parsedEvents = await this.forexFactoryService.fetchEvents('this');

      // 2. Process results (deduplicate and save)
      const summary = await this.eventsService.processScanResults(parsedEvents, batchId);

      // 3. Trigger notifications for all active users
      await this.notificationService.notifyNewEvents(summary.newEvents);
      await this.notificationService.notifyActualUpdates(summary.updatedActuals);

      // 4. Mark scan as success
      await this.eventsService.updateScanLog(batchId, {
        status: 'success',
        finished_at: new Date().toISOString(),
        events_found: parsedEvents.length,
        events_new: summary.newEvents.length,
      });

      this.logger.log(
        `Scan completed successfully. Batch: ${batchId} | Found: ${parsedEvents.length} | New: ${summary.newEvents.length}`
      );
      return { success: true, batchId };
    } catch (err: any) {
      this.logger.error(`Scan failed for batch: ${batchId}`, err.stack);

      // Mark scan as failed
      try {
        await this.eventsService.updateScanLog(batchId, {
          status: 'failed',
          finished_at: new Date().toISOString(),
          error_msg: err.message,
        });
      } catch (dbErr: any) {
        this.logger.error(`Failed to update scan_log to failed for batch: ${batchId}`, dbErr.stack);
      }

      // Alert admin via Telegram
      const adminId = this.configService.get<string>('ADMIN_TELEGRAM_ID');
      if (adminId) {
        const alertMsg = [
          `🚨 *CRON SCAN ERROR*`,
          ``,
          `• *Batch*: \`${escapeMarkdownV2(batchId)}\``,
          `• *Time*: \`${escapeMarkdownV2(new Date().toISOString())}\``,
          `• *Error*: \`${escapeMarkdownV2(err.message)}\``,
        ].join('\n');

        await this.telegramSender.sendOne(parseInt(adminId, 10), alertMsg);
      }

      return { success: false, batchId, error: err.message };
    }
  }

  async handleMorning(): Promise<void> {
    this.logger.log('⏰ Triggered morning briefing cron');
    try {
      await this.notificationService.sendMorningBriefing();
    } catch (error: any) {
      this.logger.error('Error running morning briefing cron', error.stack);
      throw error;
    }
  }

  async handleAlerts(): Promise<void> {
    this.logger.log('⏰ Triggered alerts cron');
    try {
      await this.notificationService.sendPreEventAlerts();
    } catch (error: any) {
      this.logger.error('Error running alerts cron', error.stack);
      throw error;
    }
  }
}
