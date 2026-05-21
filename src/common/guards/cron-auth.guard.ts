import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CronAuthGuard implements CanActivate {
  private readonly logger = new Logger(CronAuthGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    try {
      const req = context.switchToHttp().getRequest();
      const isVercelCron = req.headers['x-vercel-cron'] === '1';
      const cronSecret = this.configService.get<string>('CRON_SECRET');
      const hasSecret = req.headers['x-cron-secret'] === cronSecret;

      if (!cronSecret) {
        this.logger.error('CRON_SECRET is not configured');
        return false;
      }

      const isAuthorized = isVercelCron || hasSecret;
      if (!isAuthorized) {
        this.logger.warn('Unauthorized cron invocation attempt');
      }
      return isAuthorized;
    } catch (error: any) {
      this.logger.error('Error in CronAuthGuard', error.stack);
      return false;
    }
  }
}
