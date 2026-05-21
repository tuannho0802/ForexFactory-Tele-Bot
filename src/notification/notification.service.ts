import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { EventsService } from '../events/events.service';
import { TelegramSenderService } from '../telegram/telegram-sender.service';
import {
  formatNewEvent,
  formatActualUpdate,
  formatMorningBriefing,
  formatPreAlert,
} from '../telegram/message-formatter';
import { DbEvent } from '../events/events.types';
import { formatInTimeZone } from 'date-fns-tz';
import { subDays, addDays } from 'date-fns';
import { getTodayInTimezone, isEventOnDate } from '../common/utils/time.util';

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

  async sendMorningBriefing(): Promise<void> {
    try {
      this.logger.log('🌅 Running sendMorningBriefing check for all users');
      const activeUsers = await this.usersService.getActiveUsers();
      this.logger.log(`Found ${activeUsers.length} active users for morning briefing check`);

      const now = new Date();

      for (const user of activeUsers) {
        try {
          const settings = await this.usersService.getUserSettings(user.id);
          if (!settings || !settings.morning_enabled) continue;

          const tz = settings.timezone || user.timezone || 'Asia/Ho_Chi_Minh';
          const todayInUserTz = getTodayInTimezone(tz);

          // Idempotency key: ensure exactly one morning briefing per day in the user's timezone
          const idempotencyKey = `${user.id}:${todayInUserTz}:morning_briefing`;
          const alreadySent = await this.eventsService.checkNotificationLogExists(idempotencyKey);
          if (alreadySent) continue;

          // Check if current time in user's timezone is >= morning_time (format: HH:mm)
          const currentLocalTime = formatInTimeZone(now, tz, 'HH:mm');
          const morningTime = settings.morning_time || '08:00';

          if (currentLocalTime < morningTime) {
            continue;
          }

          this.logger.log(`Sending morning briefing to user ${user.id} (${user.telegram_id}) for date ${todayInUserTz}`);

          // Fetch events for yesterday, today, and tomorrow in UTC to cover timezone offsets
          const yesterdayUtc = formatInTimeZone(subDays(now, 1), 'UTC', 'yyyy-MM-dd');
          const todayUtc = formatInTimeZone(now, 'UTC', 'yyyy-MM-dd');
          const tomorrowUtc = formatInTimeZone(addDays(now, 1), 'UTC', 'yyyy-MM-dd');

          const allEvents = await this.eventsService.getEventsByDates([yesterdayUtc, todayUtc, tomorrowUtc]);

          // Filter by user's timezone date
          let userEvents = allEvents.filter(e => isEventOnDate(e.event_date, e.event_time, todayInUserTz, tz));

          // Filter by impact settings
          if (settings.impact_filter && settings.impact_filter.length > 0) {
            userEvents = userEvents.filter(e => settings.impact_filter.includes(e.impact));
          }

          // Filter by currency settings
          if (settings.currency_filter && settings.currency_filter.length > 0) {
            userEvents = userEvents.filter(e => settings.currency_filter!.includes(e.currency));
          }

          const message = formatMorningBriefing(userEvents, now, tz);

          await this.telegramSender.sendToMany([{ chatId: Number(user.telegram_id), message }]);

          await this.eventsService.insertNotificationLog({
            idempotency_key: idempotencyKey,
            user_id: user.id,
            event_id: null,
            type: 'morning_briefing',
            status: 'sent',
          });
        } catch (userError: any) {
          this.logger.error(`Error processing morning briefing for user ${user.id}`, userError.stack);
        }
      }
    } catch (error: any) {
      this.logger.error('Error in sendMorningBriefing', error.stack);
    }
  }

  async sendPreEventAlerts(): Promise<void> {
    try {
      this.logger.log('🔔 Running sendPreEventAlerts check');
      const activeUsers = await this.usersService.getActiveUsers();
      if (activeUsers.length === 0) return;

      const now = new Date();
      // Fetch upcoming events in the next 130 minutes to cover all potential user alert settings
      const fromUtc = now;
      const toUtc = new Date(now.getTime() + 130 * 60 * 1000);

      const upcomingEvents = await this.eventsService.getUpcomingEvents(fromUtc, toUtc);
      if (upcomingEvents.length === 0) return;

      this.logger.log(`Found ${upcomingEvents.length} upcoming events in the next 130 minutes`);

      for (const user of activeUsers) {
        try {
          const settings = await this.usersService.getUserSettings(user.id);
          if (!settings || !settings.alert_enabled) continue;

          const tz = settings.timezone || user.timezone || 'Asia/Ho_Chi_Minh';
          const alertMinutes = settings.alert_minutes ?? 15;

          for (const event of upcomingEvents) {
            // Apply filters first
            const matchesImpact = settings.impact_filter.includes(event.impact);
            const matchesCurrency =
              !settings.currency_filter ||
              settings.currency_filter.length === 0 ||
              settings.currency_filter.includes(event.currency);

            if (!matchesImpact || !matchesCurrency) continue;

            if (!event.event_time) continue;
            const eventDateTime = new Date(`${event.event_date}T${event.event_time}Z`);
            const diffMs = eventDateTime.getTime() - now.getTime();
            const diffMinutes = Math.floor(diffMs / 60000);

            // Trigger only when we are within the alert window (diffMinutes <= alertMinutes)
            // and the event hasn't started yet (diffMinutes >= 0)
            if (diffMinutes >= 0 && diffMinutes <= alertMinutes) {
              const idempotencyKey = `${user.id}:${event.id}:pre_alert`;
              const alreadySent = await this.eventsService.checkNotificationLogExists(idempotencyKey);
              if (alreadySent) continue;

              try {
                const message = formatPreAlert(event, alertMinutes, tz);
                await this.telegramSender.sendToMany([{ chatId: Number(user.telegram_id), message }]);

                await this.eventsService.insertNotificationLog({
                  idempotency_key: idempotencyKey,
                  user_id: user.id,
                  event_id: event.id,
                  type: 'pre_alert',
                  status: 'sent',
                });
              } catch (sendError: any) {
                this.logger.error(
                  `Failed to send pre_alert notification to user ${user.id} for event ${event.id}`,
                  sendError.stack
                );
                await this.eventsService.insertNotificationLog({
                  idempotency_key: idempotencyKey,
                  user_id: user.id,
                  event_id: event.id,
                  type: 'pre_alert',
                  status: 'failed',
                  error_msg: sendError.message,
                });
              }
            }
          }
        } catch (userError: any) {
          this.logger.error(`Error processing pre-event alerts for user ${user.id}`, userError.stack);
        }
      }
    } catch (error: any) {
      this.logger.error('Error in sendPreEventAlerts', error.stack);
    }
  }
}
