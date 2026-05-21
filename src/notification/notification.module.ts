import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { UsersModule } from '../users/users.module';
import { EventsModule } from '../events/events.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [UsersModule, EventsModule, TelegramModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
