import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: config
      .get<string>('CORS_ORIGIN', 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim()),
  });
  app.enableShutdownHooks();

  // Bind to localhost by default; the reverse proxy is the only public entry point.
  await app.listen(
    config.get<number>('API_PORT', 4000),
    config.get<string>('API_HOST', '127.0.0.1'),
  );
}
await bootstrap();
