import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import {
  loadAuthConfig,
  parseDuration,
  validateJwtSecret,
} from './auth-config.js';

const good = () => randomBytes(48).toString('base64url');

describe('validateJwtSecret', () => {
  it('accepts a random 64-character secret', () => {
    const s = good();
    expect(validateJwtSecret(s)).toBe(s);
  });

  it.each([
    ['missing', undefined, /not set/],
    ['empty', '', /not set/],
    ['the .env.example placeholder', 'change-me', /at least 32 bytes/],
    ['short', 'a1B2c3D4e5F6g7H8', /at least 32 bytes/],
    [
      'padded placeholder',
      'change-me-change-me-change-me-change-me',
      /placeholder/,
    ],
    [
      'contains "secret"',
      'my-super-secret-jwt-key-0123456789abcdef',
      /placeholder/,
    ],
    ['low variety', 'ab'.repeat(32), /variety/],
  ])('rejects %s', (_, secret, message) => {
    expect(() => validateJwtSecret(secret)).toThrow(message);
  });

  it('never includes the value in the error', () => {
    const s = 'ab'.repeat(32);
    try {
      validateJwtSecret(s);
    } catch (e) {
      expect((e as Error).message).not.toContain(s);
    }
  });
});

describe('parseDuration', () => {
  it.each([
    ['8h', 28800],
    ['30m', 1800],
    ['1d', 86400],
    ['300s', 300],
    ['7d', 604800],
  ])('%s -> %i s', (v, s) => {
    expect(parseDuration(v)).toBe(s);
  });

  it.each(['', '8', '8 hours', '-1h', '1w', '4m', '8d'])('rejects %s', (v) => {
    expect(() => parseDuration(v)).toThrow();
  });
});

describe('loadAuthConfig', () => {
  const load = (env: Record<string, string>) =>
    loadAuthConfig(new ConfigService({ JWT_SECRET: good(), ...env }));

  it('defaults to 8h, Secure cookies and 100/5/10 login + 5 password-change limits', () => {
    expect(load({})).toMatchObject({
      ttlSeconds: 28800,
      cookieSecure: true,
      loginLimitPerIp: 100,
      loginLimitPerAccount: 5,
      loginLimitPerUsername: 10,
      passwordChangeLimit: 5,
    });
  });

  it('turns Secure off only when COOKIE_SECURE is exactly false', () => {
    expect(load({ COOKIE_SECURE: 'false' }).cookieSecure).toBe(false);
    expect(load({ COOKIE_SECURE: 'no' }).cookieSecure).toBe(true);
    expect(load({ COOKIE_SECURE: 'true' }).cookieSecure).toBe(true);
    // Production stays Secure by default and with any other value ...
    expect(load({ NODE_ENV: 'production' }).cookieSecure).toBe(true);
    expect(
      load({ NODE_ENV: 'production', COOKIE_SECURE: 'no' }).cookieSecure,
    ).toBe(true);
    // ... and is off only on the explicit opt-out (temporary plain HTTP).
    expect(
      load({ NODE_ENV: 'production', COOKIE_SECURE: 'false' }).cookieSecure,
    ).toBe(false);
  });

  it('rejects a bad rate limit', () => {
    expect(() => load({ LOGIN_LIMIT_PER_ACCOUNT: '0' })).toThrow();
    expect(() => load({ PASSWORD_CHANGE_LIMIT: 'abc' })).toThrow();
  });
});
