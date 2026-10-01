import {
  UnsupportedMediaTypeException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import type { Express, NextFunction, Request, Response } from 'express';
import { parseTrustProxyHops } from './config/proxy.js';

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

/**
 * Every API response is per-user or security-relevant: never store it in a
 * browser or proxy cache (e.g. customer data after logout on a shared device),
 * and never let a browser guess a different content type.
 */
function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}

/** HTTP-level setup shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  const express = app.getHttpAdapter().getInstance() as Express;
  express.disable('x-powered-by');
  // 0 = do not trust X-Forwarded-For (default). See config/proxy.ts.
  express.set(
    'trust proxy',
    parseTrustProxyHops(config.get<string>('TRUST_PROXY_HOPS')),
  );
  // First, so every response gets them — including 401/403/404/415 and errors.
  app.use(securityHeaders);
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
