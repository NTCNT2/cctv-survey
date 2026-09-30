import type { ExecutionContext } from '@nestjs/common';
import type { AuthConfig } from '../config/auth-config.js';
import type { ThrottlerOptions } from '@nestjs/throttler';
import { throttlers } from './throttle.js';

const config = {
  loginLimitPerIp: 100,
  loginLimitPerAccount: 5,
  loginLimitPerUsername: 10,
  passwordChangeLimit: 5,
} as AuthConfig;

const byName: Record<string, ThrottlerOptions> = Object.fromEntries(
  throttlers(config).map((t) => [t.name, t]),
);
const ctx = {} as ExecutionContext;
const track = (name: string, req: Record<string, unknown>) =>
  byName[name].getTracker!(req, ctx);

describe('login / password throttlers', () => {
  it('uses the configured limits', () => {
    expect(
      Object.fromEntries(Object.entries(byName).map(([n, t]) => [n, t.limit])),
    ).toEqual({
      'login-ip': 100,
      'login-account': 5,
      'login-username': 10,
      'password-change': 5,
    });
  });

  it('login-username ignores the client address and normalises the name', async () => {
    const a = await track('login-username', {
      ip: '10.0.0.1',
      body: { username: ' Alice ' },
    });
    const b = await track('login-username', {
      ip: '10.0.0.2',
      body: { username: 'alice' },
    });
    expect(a).toBe(b);
  });

  it('login-account separates the same username from different addresses', async () => {
    const a = await track('login-account', {
      ip: '10.0.0.1',
      body: { username: 'alice' },
    });
    const b = await track('login-account', {
      ip: '10.0.0.2',
      body: { username: 'alice' },
    });
    expect(a).not.toBe(b);
  });

  it('bounds the username part of the key', async () => {
    const key = await track('login-username', {
      body: { username: 'x'.repeat(10_000) },
    });
    expect(key.length).toBeLessThan(80);
  });

  it('password-change is keyed on the signed-in user, not the address', async () => {
    const a = await track('password-change', {
      ip: '10.0.0.1',
      user: { id: 'u1' },
    });
    const b = await track('password-change', {
      ip: '10.0.0.2',
      user: { id: 'u1' },
    });
    expect(a).toBe(b);
  });
});
