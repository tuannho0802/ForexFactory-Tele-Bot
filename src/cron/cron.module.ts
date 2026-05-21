import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CronService } from './cron.service';
import { CronController } from './cron.controller';
import { RedisModule } from '../redis/redis.module';
import { ScraperModule } from '../scraper/scraper.module';
import { EventsModule } from '../events/events.module';
import { NotificationModule } from '../notification/notification.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
    ScraperModule,
    EventsModule,
    NotificationModule,
    TelegramModule,
  ],
  controllers: [CronController],
  providers: [CronService],
  exports: [CronService],
})
export class CronModule {}
