import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Express } from 'express';

/** Web origins allowed when CORS_ORIGIN is unset (README uses 127.0.0.1). */
const DEFAULT_CORS_ORIGIN = 'http://localhost:3000,http://127.0.0.1:3000';

/** HTTP-level setup shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  (app.getHttpAdapter().getInstance() as Express).disable('x-powered-by');
  // Request bodies for the CRUD routes are validated by ZodValidationPipe; this
  // pipe only applies to class-based DTOs.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: config
      .get<string>('CORS_ORIGIN', DEFAULT_CORS_ORIGIN)
      .split(',')
      .map((o) => o.trim()),
  });
}
