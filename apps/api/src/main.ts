import './load-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService);

  // Restrict CORS to known web origins (localhost in dev, the deployed web in prod).
  const allowed = config.corsOrigins;
  app.enableCors({
    origin: (origin, cb) =>
      cb(null, !origin || allowed.includes(origin)),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  // Render (and most PaaS) inject the port to bind to via $PORT.
  const port = process.env.PORT ? Number(process.env.PORT) : config.apiPort;
  await app.listen(port, '0.0.0.0');
  Logger.log(`JARVIS API listening on :${port}/api`, 'Bootstrap');
}

bootstrap();
