import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import serverless from 'serverless-http';

let cachedServer: any;

async function bootstrap() {
  if (!cachedServer) {
    const expressApp = express();
    const app = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressApp),
      { bufferLogs: true }
    );

    // Use nestjs-pino as global logger
    app.useLogger(app.get(Logger));

    // Enable global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      })
    );

    await app.init();
    cachedServer = serverless(expressApp);
  }
  return cachedServer;
}

// Export the serverless handler
export default async (req: any, res: any) => {
  const server = await bootstrap();
  return server(req, res);
};
