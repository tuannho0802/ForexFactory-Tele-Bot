import { Controller, Get, Headers, UnauthorizedException, Logger } from '@nestjs/common';
import { CronService } from './cron.service';
import { ConfigService } from '@nestjs/config';

@Controller('api/cron')
export class CronController {
  private readonly logger = new Logger(CronController.name);

  constructor(
    private readonly cronService: CronService,
    private readonly configService: ConfigService,
  ) {}

  private validateSecret(secret: string) {
    const expectedSecret = this.configService.get<string>('CRON_SECRET');
    if (!expectedSecret || secret !== expectedSecret) {
      this.logger.warn(`Unauthorized cron attempt with secret: ${secret}`);
      throw new UnauthorizedException('Invalid cron secret');
    }
  }

  @Get('scan')
  async runScan(@Headers('x-cron-secret') secret: string) {
    this.logger.log('🚀 Manual/Cron trigger: Scan');
    this.validateSecret(secret);
    return await this.cronService.handleScan();
  }

  @Get('morning')
  async runMorning(@Headers('x-cron-secret') secret: string) {
    this.logger.log('🚀 Manual/Cron trigger: Morning Briefing');
    this.validateSecret(secret);
    await this.cronService.handleMorning();
    return { success: true, message: 'Morning briefing sent' };
  }

  @Get('alerts')
  async runAlerts(@Headers('x-cron-secret') secret: string) {
    this.logger.log('🚀 Manual/Cron trigger: Alerts');
    this.validateSecret(secret);
    await this.cronService.handleAlerts();
    return { success: true, message: 'Pre-event alerts processed' };
  }
}
