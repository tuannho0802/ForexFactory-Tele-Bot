import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegramUpdate } from './telegram.update';
import { TelegramSenderService } from './telegram-sender.service';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { UsersModule } from '../users/users.module';
import { EventsModule } from '../events/events.module';
import { ScraperModule } from '../scraper/scraper.module';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const token = configService.get<string>('TELEGRAM_BOT_TOKEN')!;
        const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

        if (isProduction) {
          return { token, launchOptions: false };
        }

        return { token, launchOptions: {} };
      },
    }),
    UsersModule,
    EventsModule,
    ScraperModule,
  ],
  controllers: [TelegramWebhookController],
  providers: [TelegramUpdate, TelegramSenderService],
  exports: [TelegramSenderService],
})
export class TelegramModule {}
