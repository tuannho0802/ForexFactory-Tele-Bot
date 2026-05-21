import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { UsersService } from '../users/users.service';
import { sleep } from '../common/utils/sleep.util';

@Injectable()
export class TelegramSenderService {
  private readonly logger = new Logger(TelegramSenderService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf<any>,
    private readonly usersService: UsersService
  ) {}

  /**
   * Send messages sequentially with 50ms delay between each.
   * Max ~20 msg/sec — safely under Telegram's 30 msg/sec global limit.
   * Handles 403 (user blocked bot) and 429 (rate limit) gracefully.
   */
  async sendToMany(recipients: Array<{ chatId: number; message: string }>): Promise<void> {
    for (const { chatId, message } of recipients) {
      try {
        await this.bot.telegram.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
      } catch (err: any) {
        const code = err.code ?? err.response?.error_code;

        if (code === 403) {
          // User blocked the bot — deactivate them
          this.logger.warn(`User ${chatId} blocked the bot (403). Deactivating.`);
          await this.usersService.deactivateUser(chatId).catch((deactivateErr: any) => {
            this.logger.error(`Failed to deactivate user ${chatId}`, deactivateErr.stack);
          });
        } else if (code === 429) {
          // Telegram rate limit — wait and retry once
          const retryAfter = (err.parameters?.retry_after ?? err.response?.parameters?.retry_after ?? 5) * 1000;
          this.logger.warn(`Telegram rate limit (429) for chat ${chatId}. Waiting ${retryAfter}ms then retrying.`);
          await sleep(retryAfter);
          try {
            await this.bot.telegram.sendMessage(chatId, message, { parse_mode: 'MarkdownV2' });
          } catch (retryErr: any) {
            this.logger.error(`Retry failed for chat ${chatId}`, retryErr.stack);
          }
        } else {
          this.logger.error(`Failed to send message to ${chatId}: ${err.message}`, err.stack);
        }
      }

      // 50ms gap between sends = max ~20 msg/sec, safe buffer under limit
      await sleep(50);
    }
  }

  /**
   * Convenience wrapper to send a single message.
   */
  async sendOne(chatId: number, message: string): Promise<void> {
    return this.sendToMany([{ chatId, message }]);
  }
}
