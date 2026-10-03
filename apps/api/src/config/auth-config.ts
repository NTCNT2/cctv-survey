import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

export interface AuthConfig {
  jwtSecret: string;
  /** Token and session lifetime in seconds. */
  ttlSeconds: number;
  cookieSecure: boolean;
  /** Login attempts per minute: per client IP (burst guard), per IP + username, per username. */
  loginLimitPerIp: number;
  loginLimitPerAccount: number;
  loginLimitPerUsername: number;
  /** change-password attempts per minute per signed-in user. */
  passwordChangeLimit: number;
}

export const SESSION_COOKIE = 'cctv_session';
export const JWT_ISSUER = 'cctv-survey-api';
export const JWT_AUDIENCE = 'cctv-survey-web';

// Words of 6+ letters only: a random 64-char secret contains one by chance
// with negligible probability, while typical placeholders are caught.
const PLACEHOLDER_HINTS = [
  'change',
  'example',
  'placeholder',
  'secret',
  'password',
];
const MIN_SECRET_BYTES = 32;
const MIN_TTL_SECONDS = 5 * 60;
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Rejects missing, short, low-entropy and placeholder secrets. The error never
 * includes the value itself.
 */
export function validateJwtSecret(secret: string | undefined): string {
  const hint =
    'set JWT_SECRET in .env to a random value, e.g. `openssl rand -base64 48`';
  if (!secret) throw new Error(`JWT_SECRET is not set — ${hint}`);
  if (Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_SECRET_BYTES} bytes — ${hint}`,
    );
  }
  const lower = secret.toLowerCase();
  if (PLACEHOLDER_HINTS.some((w) => lower.includes(w))) {
    throw new Error(`JWT_SECRET looks like a placeholder — ${hint}`);
  }
  if (new Set(secret).size < 16) {
    throw new Error(`JWT_SECRET has too little variety — ${hint}`);
  }
  return secret;
}

/** Parses `30m`, `8h`, `1d`, `3600s` (5 minutes – 7 days) into seconds. */
export function parseDuration(value: string): number {
  const m = /^(\d+)([smhd])$/.exec(value.trim());
  if (!m) {
    throw new Error(
      `JWT_EXPIRES_IN must look like 30m, 8h or 1d (got "${value}")`,
    );
  }
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[
    m[2] as 's' | 'm' | 'h' | 'd'
  ];
  const seconds = Number(m[1]) * unit;
  if (seconds < MIN_TTL_SECONDS || seconds > MAX_TTL_SECONDS) {
    throw new Error('JWT_EXPIRES_IN must be between 5m and 7d');
  }
  return seconds;
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`expected a positive integer, got "${value}"`);
  }
  return n;
}

export function loadAuthConfig(config: ConfigService): AuthConfig {
  const production = config.get<string>('NODE_ENV') === 'production';
  // Secure unless explicitly disabled with exactly COOKIE_SECURE=false (local
  // http:// development, or a temporary plain-HTTP production deployment).
  // Anything else, including unset, keeps it on.
  const cookieSecure = config.get<string>('COOKIE_SECURE') !== 'false';
  if (production && !cookieSecure) {
    new Logger('AuthConfig').warn(
      'COOKIE_SECURE=false in production: the session cookie is sent over plain HTTP',
    );
  }
  return {
    jwtSecret: validateJwtSecret(config.get<string>('JWT_SECRET')),
    ttlSeconds: parseDuration(config.get<string>('JWT_EXPIRES_IN') ?? '8h'),
    cookieSecure,
    loginLimitPerIp: positiveInt(config.get<string>('LOGIN_LIMIT_PER_IP'), 100),
    loginLimitPerAccount: positiveInt(
      config.get<string>('LOGIN_LIMIT_PER_ACCOUNT'),
      5,
    ),
    loginLimitPerUsername: positiveInt(
      config.get<string>('LOGIN_LIMIT_PER_USERNAME'),
      10,
    ),
    passwordChangeLimit: positiveInt(
      config.get<string>('PASSWORD_CHANGE_LIMIT'),
      5,
    ),
  };
}
