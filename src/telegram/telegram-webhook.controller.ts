import { Controller, Post, Req, Res, UseGuards, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { TelegramWebhookGuard } from '../common/guards/telegram-webhook.guard';
import { Logger } from '@nestjs/common';

@Controller('webhook')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(@InjectBot() private readonly bot: Telegraf<any>) {}

  @Post('telegram')
  @UseGuards(TelegramWebhookGuard)
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    try {
      this.logger.log(`--- WEBHOOK RECEIVED ---`);
      this.logger.log(`Method: ${req.method}`);
      this.logger.log(`Headers: ${JSON.stringify(req.headers)}`);
      this.logger.log(`Body: ${JSON.stringify(req.body).slice(0, 1000)}`);
      
      if (!req.body || Object.keys(req.body).length === 0) {
        this.logger.warn('Received empty body from Telegram');
        return res.status(HttpStatus.OK).end();
      }

      // Process the Telegram update
      await this.bot.handleUpdate(req.body, res);
      
      this.logger.log(`--- WEBHOOK PROCESSED SUCCESS ---`);
      
      if (!res.headersSent) {
        res.status(HttpStatus.OK).end();
      }
    } catch (err: any) {
      this.logger.error(`❌ Webhook Error: ${err.message}`, err.stack);
      if (!res.headersSent) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(err.message);
      }
    }
  }
}
