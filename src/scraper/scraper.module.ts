import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ForexFactoryService } from './forex-factory.service';

@Module({
  imports: [HttpModule],
  providers: [ForexFactoryService],
  exports: [ForexFactoryService],
})
export class ScraperModule {}
