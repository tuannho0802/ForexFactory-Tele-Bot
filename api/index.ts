import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';

const express = require('express');
const serverless = require('serverless-http');

let cachedServer: any;

async function bootstrap() {
  if (!cachedServer) {
    console.log('--- BOOTSTRAP STARTING ---');
    try {
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
      console.log('--- BOOTSTRAP SUCCESSFUL ---');
    } catch (error: any) {
      console.error('--- BOOTSTRAP FAILED ---');
      console.error(error);
      throw error;
    }
  }
  return cachedServer;
}

export default async (req: any, res: any) => {
  console.log(`[${new Date().toISOString()}] Request: ${req.method} ${req.url}`);
  try {
    const server = await bootstrap();
    return server(req, res);
  } catch (err: any) {
    console.error('--- HANDLER FATAL ERROR ---');
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
    }
  }
};
