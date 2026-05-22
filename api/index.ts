import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';

const express = require('express');
const serverless = require('serverless-http');

let cachedServer: any;

async function bootstrap() {
  if (cachedServer) return cachedServer;

  console.log('[Bootstrap] Starting NestJS application...');

  const expressApp = express();
  try {
    const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
      bufferLogs: true,
      logger:
        process.env.NODE_ENV === 'production'
          ? ['error', 'warn']
          : ['log', 'debug', 'error', 'warn', 'verbose'],
    });

    try {
      const pinoLogger = app.get(Logger);
      app.useLogger(pinoLogger);
      console.log('[Bootstrap] Pino logger initialized');
    } catch (loggerErr) {
      console.warn(
        '[Bootstrap] Could not initialize pino logger, using default:',
        loggerErr,
      );
    }

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
      }),
    );

    await app.init();
    cachedServer = serverless(expressApp);
    console.log('[Bootstrap] Application initialized successfully');
    return cachedServer;
  } catch (error: any) {
    console.error('[Fatal] Bootstrap error:', error?.message ?? error);
    console.error(error?.stack ?? error);
    throw error;
  }
}

export default async (req: any, res: any) => {
  console.log(`[Request] ${req.method} ${req.url}`);
  try {
    const server = await bootstrap();
    return server(req, res);
  } catch (err: any) {
    console.error('[Fatal] Bootstrap or handler error:', err?.message ?? err);
    console.error(err?.stack ?? err);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: err?.message ?? String(err),
      });
    }
  }
};
