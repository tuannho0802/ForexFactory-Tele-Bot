import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import express from 'express';
import serverless from 'serverless-http';

let cachedHandler: any;

async function bootstrap() {
  if (cachedHandler) return cachedHandler;

  console.log('[Bootstrap] Starting NestJS...');

  const expressApp = express();

  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    bufferLogs: true,
    logger: ['error', 'warn', 'log'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  await app.init();

  cachedHandler = serverless(expressApp);

  console.log('[Bootstrap] Done.');
  return cachedHandler;
}

export default async (req: any, res: any) => {
  try {
    const handler = await bootstrap();
    return handler(req, res);
  } catch (err: any) {
    console.error('[Fatal]', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }
};
