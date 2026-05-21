import { Controller, Post, UseGuards, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { CronService } from './cron.service';
import { CronAuthGuard } from '../common/guards/cron-auth.guard';
import { Logger } from '@nestjs/common';

@Controller('api/cron')
export class CronController {
  private readonly logger = new Logger(CronController.name);

  constructor(private readonly cronService: CronService) {}

  @Post('scan')
  @UseGuards(CronAuthGuard)
  async scan(@Res() res: Response) {
    try {
      this.logger.log('Triggered economic calendar scan via cron endpoint');
      const result = await this.cronService.handleScan();
      if (result.success) {
        return res.status(HttpStatus.OK).json(result);
      } else {
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(result);
      }
    } catch (err: any) {
      this.logger.error('Error during calendar scan in controller', err.stack);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: err.message,
      });
    }
  }

  @Post('morning')
  @UseGuards(CronAuthGuard)
  async morning(@Res() res: Response) {
    try {
      this.logger.log('Triggered morning briefing via cron endpoint');
      await this.cronService.handleMorning();
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Morning brief sent successfully',
      });
    } catch (err: any) {
      this.logger.error('Error during morning briefing in controller', err.stack);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: err.message,
      });
    }
  }

  @Post('alerts')
  @UseGuards(CronAuthGuard)
  async alerts(@Res() res: Response) {
    try {
      this.logger.log('Triggered pre-event alerts via cron endpoint');
      await this.cronService.handleAlerts();
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Pre-event alerts sent successfully',
      });
    } catch (err: any) {
      this.logger.error('Error during pre-event alerts in controller', err.stack);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: err.message,
      });
    }
  }
}
