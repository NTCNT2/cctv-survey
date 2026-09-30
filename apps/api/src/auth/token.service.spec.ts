import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { forgeJwt, now } from '../../test/jwt-forge.js';
import type { AuthConfig } from '../config/auth-config.js';
import { TokenService } from './token.service.js';

const secret = randomBytes(48).toString('base64url');
const config: AuthConfig = {
  jwtSecret: secret,
  ttlSeconds: 28800,
  cookieSecure: false,
  loginLimitPerIp: 100,
  loginLimitPerAccount: 5,
  loginLimitPerUsername: 10,
  passwordChangeLimit: 5,
};
const svc = new TokenService(new JwtService({}), config);
const claims = {
  sub: '3f1c2a9e-8b7d-4c21-9f3e-2a1b0c9d8e7f',
  jti: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
};
const base = {
  ...claims,
  iss: 'cctv-survey-api',
  aud: 'cctv-survey-web',
  iat: now(),
  exp: now() + 600,
};

describe('TokenService', () => {
  it('signs HS256 tokens with sub, jti, iss, aud and an 8h expiry', async () => {
    const token = await svc.sign(claims);
    const [h, p] = token
      .split('.')
      .slice(0, 2)
      .map((x) => JSON.parse(Buffer.from(x, 'base64url').toString()));
    expect(h.alg).toBe('HS256');
    expect(p).toMatchObject({ ...claims, iss: base.iss, aud: base.aud });
    expect(p.exp - p.iat).toBe(28800);
    expect(await svc.verify(token)).toEqual(claims);
  });

  it('accepts a correctly forged-by-us token (sanity check of the forger)', async () => {
    expect(await svc.verify(forgeJwt(base, { secret }))).toEqual(claims);
  });

  it.each([
    ['alg none', () => forgeJwt(base, { alg: 'none' })],
    ['wrong secret', () => forgeJwt(base, { secret: secret + 'x' })],
    ['expired', () => forgeJwt({ ...base, exp: now() - 1 }, { secret })],
    ['wrong issuer', () => forgeJwt({ ...base, iss: 'evil' }, { secret })],
    ['wrong audience', () => forgeJwt({ ...base, aud: 'evil' }, { secret })],
    ['missing jti', () => forgeJwt({ ...base, jti: undefined }, { secret })],
    ['numeric sub', () => forgeJwt({ ...base, sub: 1 }, { secret })],
    ['garbage', () => 'a.b.c'],
    ['empty', () => ''],
  ])('rejects %s', async (_, make) => {
    expect(await svc.verify(make())).toBeUndefined();
  });

  it('rejects a token whose payload was edited after signing', async () => {
    const [h, , s] = (await svc.sign(claims)).split('.');
    const p = Buffer.from(
      JSON.stringify({ ...base, sub: '00000000-0000-4000-8000-000000000000' }),
    ).toString('base64url');
    expect(await svc.verify(`${h}.${p}.${s}`)).toBeUndefined();
  });
});
