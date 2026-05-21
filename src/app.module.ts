import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { getConfig } from './config/configuration';
import { SupabaseModule } from './supabase/supabase.module';
import { UsersModule } from './users/users.module';
import { EventsModule } from './events/events.module';
import { ScraperModule } from './scraper/scraper.module';
import { TelegramModule } from './telegram/telegram.module';
import { NotificationModule } from './notification/notification.module';
import { CronModule } from './cron/cron.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [getConfig],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
      },
    }),
    SupabaseModule,
    UsersModule,
    EventsModule,
    ScraperModule,
    TelegramModule,
    NotificationModule,
    CronModule,
  ],
})
export class AppModule {}
