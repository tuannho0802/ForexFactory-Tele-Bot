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
      this.logger.log(`Processing new-event notifications for ${newEvents.length} events`);
      const activeUsers = await this.usersService.getActiveUsers();
      this.logger.log(`Found ${activeUsers.length} active users`);

      for (const user of activeUsers) {
        const settings = await this.usersService.getUserSettings(user.id);
        if (!settings) continue;

        for (const event of newEvents) {
          const matchesImpact = settings.impact_filter.includes(event.impact);
          const matchesCurrency =
            !settings.currency_filter ||
            settings.currency_filter.length === 0 ||
            settings.currency_filter.includes(event.currency);

          if (!matchesImpact || !matchesCurrency) continue;

          const idempotencyKey = `${user.id}:${event.id}:new_event`;
          const alreadySent = await this.eventsService.checkNotificationLogExists(idempotencyKey);
          if (alreadySent) continue;

          try {
            const userTimezone = user.timezone || 'Asia/Ho_Chi_Minh';
            const message = formatNewEvent(event, userTimezone);

            await this.telegramSender.sendToMany([{ chatId: Number(user.telegram_id), message }]);

            await this.eventsService.insertNotificationLog({
              idempotency_key: idempotencyKey,
              user_id: user.id,
              event_id: event.id,
              type: 'new_event',
              status: 'sent',
            });
          } catch (sendError: any) {
            this.logger.error(
              `Failed to send new_event notification to user ${user.id} for event ${event.id}`,
              sendError.stack
            );
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
      this.logger.log(`Processing actual-update notifications for ${events.length} events`);
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

          if (!matchesImpact || !matchesCurrency) continue;

          const idempotencyKey = `${user.id}:${event.id}:actual_update`;
          const alreadySent = await this.eventsService.checkNotificationLogExists(idempotencyKey);
          if (alreadySent) continue;

          try {
            const userTimezone = user.timezone || 'Asia/Ho_Chi_Minh';
            const message = formatActualUpdate(event, userTimezone);

            await this.telegramSender.sendToMany([{ chatId: Number(user.telegram_id), message }]);

            await this.eventsService.insertNotificationLog({
              idempotency_key: idempotencyKey,
              user_id: user.id,
              event_id: event.id,
              type: 'actual_update',
              status: 'sent',
            });
          } catch (sendError: any) {
            this.logger.error(
              `Failed to send actual_update notification to user ${user.id} for event ${event.id}`,
              sendError.stack
            );
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
