import { Controller, Get, Post, UnauthorizedException, Logger, Req } from '@nestjs/common';
import { CronService } from './cron.service';
import { ConfigService } from '@nestjs/config';

@Controller('api/cron')
export class CronController {
  private readonly logger = new Logger(CronController.name);

  constructor(
    private readonly cronService: CronService,
    private readonly configService: ConfigService,
  ) {}

  private validateSecret(req: any): void {
    const expectedSecret = this.configService.get<string>('CRON_SECRET');
    if (!expectedSecret) {
      this.logger.warn('CRON_SECRET not configured — skipping validation');
      return;
    }

    const headerSecret = req.headers['x-cron-secret'];
    const authSecret = req.headers['authorization']?.replace('Bearer ', '');

    if (headerSecret !== expectedSecret && authSecret !== expectedSecret) {
      this.logger.warn('Unauthorized cron attempt');
      throw new UnauthorizedException('Invalid cron secret');
    }
  }

  @Get('scan')
  @Post('scan')
  async runScan(@Req() req: any) {
    this.logger.log('🚀 Cron trigger: Scan');
    this.validateSecret(req);
    return await this.cronService.handleScan();
  }

  @Get('morning')
  @Post('morning')
  async runMorning(@Req() req: any) {
    this.logger.log('🚀 Cron trigger: Morning Briefing');
    this.validateSecret(req);
    await this.cronService.handleMorning();
    return { success: true, message: 'Morning briefing sent' };
  }

  @Get('alerts')
  @Post('alerts')
  async runAlerts(@Req() req: any) {
    this.logger.log('🚀 Cron trigger: Alerts');
    this.validateSecret(req);
    await this.cronService.handleAlerts();
    return { success: true, message: 'Pre-event alerts processed' };
  }

  @Get('health')
  async health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
