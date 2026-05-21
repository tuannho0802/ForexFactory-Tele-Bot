import { Controller, Get, Headers, UnauthorizedException, Logger, Req } from '@nestjs/common';
import { CronService } from './cron.service';
import { ConfigService } from '@nestjs/config';

@Controller('api/cron')
export class CronController {
  private readonly logger = new Logger(CronController.name);

  constructor(
    private readonly cronService: CronService,
    private readonly configService: ConfigService,
  ) {}

  private validateSecret(req: any) {
    const expectedSecret = this.configService.get<string>('CRON_SECRET');
    if (!expectedSecret) return; // Skip validation if not configured

    const headerSecret = req.headers['x-cron-secret'];
    const authSecret = req.headers['authorization']?.replace('Bearer ', '');
    
    if (headerSecret !== expectedSecret && authSecret !== expectedSecret) {
      this.logger.warn(`Unauthorized cron attempt`);
      throw new UnauthorizedException('Invalid cron secret');
    }
  }

  @Get('scan')
  async runScan(@Req() req: any) {
    this.logger.log('🚀 Manual/Cron trigger: Scan');
    this.validateSecret(req);
    return await this.cronService.handleScan();
  }

  @Get('morning')
  async runMorning(@Req() req: any) {
    this.logger.log('🚀 Manual/Cron trigger: Morning Briefing');
    this.validateSecret(req);
    await this.cronService.handleMorning();
    return { success: true, message: 'Morning briefing sent' };
  }

  @Get('alerts')
  async runAlerts(@Req() req: any) {
    this.logger.log('🚀 Manual/Cron trigger: Alerts');
    this.validateSecret(req);
    await this.cronService.handleAlerts();
    return { success: true, message: 'Pre-event alerts processed' };
  }
}
