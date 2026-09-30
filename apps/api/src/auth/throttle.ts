import { applyDecorators, UseGuards } from '@nestjs/common';
import {
  SkipThrottle,
  ThrottlerGuard,
  type ThrottlerOptions,
} from '@nestjs/throttler';
import type { AuthConfig } from '../config/auth-config.js';

const MINUTE = 60_000;

/**
 * Named throttlers. Every throttler applies to every route using
 * ThrottlerGuard unless skipped, so each route decorator below skips the
 * others explicitly.
 */
const LOGIN_IP = 'login-ip';
const LOGIN_ACCOUNT = 'login-account';
const LOGIN_USERNAME = 'login-username';
const PASSWORD_CHANGE = 'password-change';

function username(req: Record<string, any>): string {
  const body = req.body as { username?: unknown } | undefined;
  return typeof body?.username === 'string'
    ? body.username.trim().toLowerCase().slice(0, 64)
    : '';
}

export function throttlers(auth: AuthConfig): ThrottlerOptions[] {
  return [
    // Burst guard only: all traffic may arrive from one address (SSH tunnel,
    // web server, reverse proxy), so this must stay well above normal use.
    { name: LOGIN_IP, ttl: MINUTE, limit: auth.loginLimitPerIp },
    // Main guessing limit for one client against one account.
    {
      name: LOGIN_ACCOUNT,
      ttl: MINUTE,
      limit: auth.loginLimitPerAccount,
      getTracker: (req) => `${String(req.ip)}|${username(req)}`,
    },
    // Caps guessing against one account from many addresses. At worst one
    // account is blocked for a minute — never everyone.
    {
      name: LOGIN_USERNAME,
      ttl: MINUTE,
      limit: auth.loginLimitPerUsername,
      getTracker: (req) => `user:${username(req)}`,
    },
    // Signed-in users: the AuthGuard has already set req.user.
    {
      name: PASSWORD_CHANGE,
      ttl: MINUTE,
      limit: auth.passwordChangeLimit,
      getTracker: (req) =>
        `uid:${String((req.user as { id?: string } | undefined)?.id ?? req.ip)}`,
    },
  ];
}

export const LoginThrottle = () =>
  applyDecorators(
    UseGuards(ThrottlerGuard),
    SkipThrottle({ [PASSWORD_CHANGE]: true }),
  );

export const PasswordChangeThrottle = () =>
  applyDecorators(
    UseGuards(ThrottlerGuard),
    SkipThrottle({
      [LOGIN_IP]: true,
      [LOGIN_ACCOUNT]: true,
      [LOGIN_USERNAME]: true,
    }),
  );
