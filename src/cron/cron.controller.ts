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
    // TODO: Sprint 3 - Morning brief sending
    return res.status(HttpStatus.OK).json({
      success: true,
      message: 'TODO: Sprint 3 - Morning brief sending not implemented yet',
    });
  }

  @Post('alerts')
  @UseGuards(CronAuthGuard)
  async alerts(@Res() res: Response) {
    // TODO: Sprint 3 - Pre-event alerts sending
    return res.status(HttpStatus.OK).json({
      success: true,
      message: 'TODO: Sprint 3 - Pre-event alerts sending not implemented yet',
    });
  }
}
