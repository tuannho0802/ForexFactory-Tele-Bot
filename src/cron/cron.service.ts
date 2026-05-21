import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { ForexFactoryService } from '../scraper/forex-factory.service';
import { EventsService } from '../events/events.service';
import { NotificationService } from '../notification/notification.service';
import { TelegramSenderService } from '../telegram/telegram-sender.service';
import { ConfigService } from '@nestjs/config';
import { escapeMarkdownV2 } from '../telegram/message-formatter';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly forexFactoryService: ForexFactoryService,
    private readonly eventsService: EventsService,
    private readonly notificationService: NotificationService,
    private readonly telegramSender: TelegramSenderService,
    private readonly configService: ConfigService
  ) {}

  async handleScan(): Promise<{ success: boolean; batchId?: string; error?: string }> {
    const lockKey = 'cron:scan';
    const lockTtl = 300; // 5 minutes

    const result = await this.redisService.withLock(lockKey, lockTtl, async () => {
      const batchId = `batch-${Date.now()}`;
      this.logger.log(`Starting economic calendar scan. Batch ID: ${batchId}`);

      // Insert scan log
      await this.eventsService.createScanLog(batchId, 'forexfactory');

      try {
        // 1. Fetch events
        const parsedEvents = await this.forexFactoryService.fetchEvents('this');

        // 2. Process results (deduplicate and save)
        const summary = await this.eventsService.processScanResults(parsedEvents, batchId);

        // 3. Trigger notifications
        await this.notificationService.notifyNewEvents(summary.newEvents);
        await this.notificationService.notifyActualUpdates(summary.updatedActuals);

        // 4. Update scan log to success
        await this.eventsService.updateScanLog(batchId, {
          status: 'success',
          finished_at: new Date().toISOString(),
          events_found: parsedEvents.length,
          events_new: summary.newEvents.length,
        });

        this.logger.log(`Calendar scan successfully completed. Batch ID: ${batchId}`);
        return { success: true, batchId };
      } catch (err: any) {
        this.logger.error(`Failed to execute scan for batch: ${batchId}`, err.stack);

        // Update scan log to failed
        try {
          await this.eventsService.updateScanLog(batchId, {
            status: 'failed',
            finished_at: new Date().toISOString(),
            error_msg: err.message,
          });
        } catch (dbErr: any) {
          this.logger.error(`Failed to update failed scan log for batch: ${batchId}`, dbErr.stack);
        }

        // Alert Admin
        const adminId = this.configService.get<string>('ADMIN_TELEGRAM_ID');
        if (adminId) {
          const alertMsg = [
            `🚨 *CRON SCAN SYSTEM ERROR*`,
            ``,
            `• *Batch ID*: \`${escapeMarkdownV2(batchId)}\``,
            `• *Time*: \`${escapeMarkdownV2(new Date().toISOString())}\``,
            `• *Error*: \`${escapeMarkdownV2(err.message)}\``,
          ].join('\n');

          this.telegramSender.enqueue(parseInt(adminId, 10), alertMsg, 'MarkdownV2');
        }

        return { success: false, batchId, error: err.message };
      }
    });

    if (result === null) {
      this.logger.warn(`Scan execution skipped: Redis lock '${lockKey}' is already held.`);
      return { success: false, error: 'Redis lock already held' };
    }

    return result;
  }

  // TODO: Sprint 3 - handleMorning()
  // async handleMorning(): Promise<void> { ... }

  // TODO: Sprint 3 - handleAlerts()
  // async handleAlerts(): Promise<void> { ... }
}
