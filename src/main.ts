import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as serverlessExpress from 'serverless-http';

// Express instance used for serverless mode
const expressApp = express();

let serverlessHandler: any;

async function bootstrap() {
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
  
  return serverlessExpress(expressApp);
}

// In serverless environments, we export the handler
export const handler = async (req: any, res: any) => {
  if (!serverlessHandler) {
    serverlessHandler = await bootstrap();
  }
  return serverlessHandler(req, res);
};

// Local development server runner
async function bootstrapLocal() {
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    
    // Use nestjs-pino as global logger
    app.useLogger(app.get(Logger));
    
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      })
    );

    const port = process.env.PORT || 3000;
    await app.listen(port);
    const appLogger = app.get(Logger);
    appLogger.log(`Application is running locally on: http://localhost:${port}`);
  }
}

// If running locally, start server
bootstrapLocal();
