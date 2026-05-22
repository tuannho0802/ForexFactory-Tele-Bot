import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import serverless from 'serverless-http';

let cachedServer: any;

async function bootstrapServerless() {
  if (cachedServer) return cachedServer;

  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    bufferLogs: true,
  });

  try {
    app.useLogger(app.get(Logger));
  } catch {
    // ignore
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
  return cachedServer;
}

export default async (req: any, res: any) => {
  const server = await bootstrapServerless();
  return server(req, res);
};

async function bootstrapLocal() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  try {
    app.useLogger(app.get(Logger));
  } catch {
    // ignore
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`[Local] Application is running on: http://localhost:${port}`);
}

if (!process.env.VERCEL && require.main === module) {
  bootstrapLocal().catch((err) => {
    console.error('Failed to start local server:', err);
    process.exit(1);
  });
}
