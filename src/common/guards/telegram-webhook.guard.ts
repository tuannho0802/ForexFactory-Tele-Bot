import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramWebhookGuard implements CanActivate {
  private readonly logger = new Logger(TelegramWebhookGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    try {
      const req = context.switchToHttp().getRequest();
      const secretToken = req.headers['x-telegram-bot-api-secret-token'];
      const expectedToken = this.configService.get<string>('TELEGRAM_WEBHOOK_SECRET');

      if (!expectedToken) {
        this.logger.error('TELEGRAM_WEBHOOK_SECRET is not configured');
        return false;
      }

      const isValid = secretToken === expectedToken;
      if (!isValid) {
        this.logger.warn(`Unauthorized webhook request. Provided: ${secretToken}`);
      }
      return isValid;
    } catch (error: any) {
      this.logger.error('Error in TelegramWebhookGuard', error.stack);
      return false;
    }
  }
}
