import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { EventsService } from '../events/events.service';
import { TelegramSenderService } from '../telegram/telegram-sender.service';
import { formatNewEvent, formatActualUpdate } from '../telegram/message-formatter';
import { DbEvent } from '../events/events.types';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly eventsService: EventsService,
    private readonly telegramSender: TelegramSenderService
  ) {}

  async notifyNewEvents(newEvents: DbEvent[]): Promise<void> {
    if (newEvents.length === 0) return;
    try {
      this.logger.log(`Processing notifications for ${newEvents.length} new events`);
      const activeUsers = await this.usersService.getActiveUsers();

      for (const user of activeUsers) {
        const settings = await this.usersService.getUserSettings(user.id);
        if (!settings) continue;

        for (const event of newEvents) {
          // Lọc theo impact
          const matchesImpact = settings.impact_filter.includes(event.impact);
          // Lọc theo currency
          const matchesCurrency =
            !settings.currency_filter ||
            settings.currency_filter.length === 0 ||
            settings.currency_filter.includes(event.currency);

          if (!matchesImpact || !matchesCurrency) {
            continue;
          }

          const dateStr = event.event_date;
          const idempotencyKey = `${user.id}:${event.id}:new_event:${dateStr}`;

          // Check if already notified
          const exists = await this.eventsService.checkNotificationLogExists(idempotencyKey);
          if (exists) {
            continue;
          }

          try {
            // Format message using user's timezone
            const userTimezone = user.timezone || 'Asia/Ho_Chi_Minh';
            const message = formatNewEvent(event, userTimezone);

            // Enqueue message
            this.telegramSender.enqueue(user.telegram_id, message, 'MarkdownV2');

            // Log notification as sent
            await this.eventsService.insertNotificationLog({
              idempotency_key: idempotencyKey,
              user_id: user.id,
              event_id: event.id,
              type: 'new_event',
              status: 'sent',
            });
          } catch (sendError: any) {
            this.logger.error(`Failed to dispatch notification to user ${user.id} for event ${event.id}: ${sendError.message}`, sendError.stack);
            await this.eventsService.insertNotificationLog({
              idempotency_key: idempotencyKey,
              user_id: user.id,
              event_id: event.id,
              type: 'new_event',
              status: 'failed',
              error_msg: sendError.message,
            });
          }
        }
      }
    } catch (error: any) {
      this.logger.error('Error in notifyNewEvents', error.stack);
    }
  }

  async notifyActualUpdates(events: DbEvent[]): Promise<void> {
    if (events.length === 0) return;
    try {
      this.logger.log(`Processing notifications for ${events.length} actual updates`);
      const activeUsers = await this.usersService.getActiveUsers();

      for (const user of activeUsers) {
        const settings = await this.usersService.getUserSettings(user.id);
        if (!settings) continue;

        for (const event of events) {
          const matchesImpact = settings.impact_filter.includes(event.impact);
          const matchesCurrency =
            !settings.currency_filter ||
            settings.currency_filter.length === 0 ||
            settings.currency_filter.includes(event.currency);

          if (!matchesImpact || !matchesCurrency) {
            continue;
          }

          const dateStr = event.event_date;
          const idempotencyKey = `${user.id}:${event.id}:actual_update:${dateStr}`;

          const exists = await this.eventsService.checkNotificationLogExists(idempotencyKey);
          if (exists) {
            continue;
          }

          try {
            const userTimezone = user.timezone || 'Asia/Ho_Chi_Minh';
            const message = formatActualUpdate(event, userTimezone);

            this.telegramSender.enqueue(user.telegram_id, message, 'MarkdownV2');

            await this.eventsService.insertNotificationLog({
              idempotency_key: idempotencyKey,
              user_id: user.id,
              event_id: event.id,
              type: 'actual_update',
              status: 'sent',
            });
          } catch (sendError: any) {
            this.logger.error(`Failed to dispatch actual update to user ${user.id} for event ${event.id}: ${sendError.message}`, sendError.stack);
            await this.eventsService.insertNotificationLog({
              idempotency_key: idempotencyKey,
              user_id: user.id,
              event_id: event.id,
              type: 'actual_update',
              status: 'failed',
              error_msg: sendError.message,
            });
          }
        }
      }
    } catch (error: any) {
      this.logger.error('Error in notifyActualUpdates', error.stack);
    }
  }

  // TODO: Sprint 3 - sendMorningBriefing()
  // async sendMorningBriefing(): Promise<void> { ... }

  // TODO: Sprint 3 - sendPreEventAlerts()
  // async sendPreEventAlerts(): Promise<void> { ... }
}
