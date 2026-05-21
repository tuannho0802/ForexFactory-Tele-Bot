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
      this.logger.log('Received Telegram update via webhook');
      
      // Process the Telegram update
      await this.bot.handleUpdate(req.body, res);
      
      if (!res.headersSent) {
        res.status(HttpStatus.OK).end();
      }
    } catch (err: any) {
      this.logger.error('Error handling Telegram webhook update', err.stack);
      if (!res.headersSent) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(err.message);
      }
    }
  }
}
