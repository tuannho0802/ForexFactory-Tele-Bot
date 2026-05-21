import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigService } from '@nestjs/config';
import { TelegramUpdate } from './telegram.update';
import { TelegramSenderService } from './telegram-sender.service';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { UsersModule } from '../users/users.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      useFactory: (configService: ConfigService) => {
        const token = configService.get<string>('TELEGRAM_BOT_TOKEN')!;
        const isProd = configService.get<string>('NODE_ENV') === 'production';

        return {
          token,
          // In production serverless mode, we process webhook updates manually
          // In development mode, we enable polling for easy local testing
          launchOptions: isProd ? false : {},
        };
      },
      inject: [ConfigService],
    }),
    UsersModule,
    EventsModule,
  ],
  controllers: [TelegramWebhookController],
  providers: [TelegramUpdate, TelegramSenderService],
  exports: [TelegramSenderService],
})
export class TelegramModule {}
