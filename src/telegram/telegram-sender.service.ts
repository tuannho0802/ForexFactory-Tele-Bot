import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { UsersService } from '../users/users.service';
import { sleep } from '../common/utils/sleep.util';

@Injectable()
export class TelegramSenderService implements OnModuleDestroy {
  private readonly logger = new Logger(TelegramSenderService.name);
  private queue: Array<{ chatId: number; message: string; parseMode: 'MarkdownV2' | 'HTML' }> = [];
  private isSending = false;
  private shouldStop = false;

  constructor(
    @InjectBot() private readonly bot: Telegraf<any>,
    private readonly usersService: UsersService
  ) {}

  enqueue(chatId: number, message: string, parseMode: 'MarkdownV2' | 'HTML' = 'MarkdownV2'): void {
    this.queue.push({ chatId, message, parseMode });
    this.logger.log(`Enqueued Telegram message to ${chatId}. Current queue size: ${this.queue.length}`);
    if (!this.isSending) {
      this.startDraining().catch((err) => {
        this.logger.error('Error draining Telegram sender queue', err.stack);
      });
    }
  }

  private async startDraining(): Promise<void> {
    this.isSending = true;
    while (this.queue.length > 0 && !this.shouldStop) {
      const batch = this.queue.splice(0, 25); // Max 25 per second
      
      const promises = batch.map(async (item) => {
        try {
          await this.bot.telegram.sendMessage(item.chatId, item.message, {
            parse_mode: item.parseMode,
          });
        } catch (error: any) {
          const code = error.code || error.response?.error_code;
          if (code === 403) {
            this.logger.warn(`User blocked bot (403). Deactivating user: ${item.chatId}`);
            await this.usersService.deactivateUser(item.chatId).catch((err) => {
              this.logger.error(`Error deactivating user: ${item.chatId}`, err.stack);
            });
          } else if (code === 429) {
            const retryAfter = error.parameters?.retry_after || error.response?.parameters?.retry_after || 5;
            this.logger.warn(`Telegram rate limit (429). Retrying after ${retryAfter}s.`);
            // Put item back at the start of the queue
            this.queue.unshift(item);
            await sleep(retryAfter * 1000);
          } else {
            this.logger.error(`Failed to send Telegram message to ${item.chatId}: ${error.message}`, error.stack);
          }
        }
      });

      await Promise.allSettled(promises);

      if (this.queue.length > 0 && !this.shouldStop) {
        await sleep(1000); // Space batches by 1 second
      }
    }
    this.isSending = false;
  }

  onModuleDestroy() {
    this.shouldStop = true;
  }
}
