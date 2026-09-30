import {
  UnsupportedMediaTypeException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import type { Express, NextFunction, Request, Response } from 'express';

/** Web origins allowed when CORS_ORIGIN is unset (README uses 127.0.0.1). */
const DEFAULT_CORS_ORIGIN = 'http://localhost:3000,http://127.0.0.1:3000';

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Request bodies must be JSON. HTML forms can only send urlencoded, multipart
 * or text/plain, so this also blocks form-based CSRF (on top of SameSite).
 */
function requireJsonBody(req: Request, _res: Response, next: NextFunction) {
  const hasBody =
    req.headers['transfer-encoding'] !== undefined ||
    Number(req.headers['content-length'] ?? 0) > 0;
  const declared = req.headers['content-type'] !== undefined;
  if (
    BODY_METHODS.has(req.method) &&
    (hasBody || declared) &&
    !req.is('application/json')
  ) {
    next(new UnsupportedMediaTypeException('request body must be JSON'));
    return;
  }
  next();
}

/** HTTP-level setup shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  (app.getHttpAdapter().getInstance() as Express).disable('x-powered-by');
  app.use(cookieParser());
  app.use(requireJsonBody);
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
    // The session cookie must be sent with cross-origin (web -> api) requests.
    credentials: true,
  });
}
