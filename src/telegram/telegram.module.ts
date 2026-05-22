import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegramSenderService } from './telegram-sender.service';
import { UsersModule } from '../users/users.module';
import { EventsModule } from '../events/events.module';
import { ScraperModule } from '../scraper/scraper.module';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        token: configService.get<string>('TELEGRAM_BOT_TOKEN')!,
        launchOptions: false,
      }),
    }),
    UsersModule,
    EventsModule,
    ScraperModule,
  ],
  providers: [TelegramSenderService],
  exports: [TelegramSenderService],
})
export class TelegramModule {}
