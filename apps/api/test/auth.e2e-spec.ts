import type { INestApplication, LoggerService } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { UsersService } from '../src/users/users.service.js';
import {
  createTestApp,
  sessionCookie,
  UserFactory,
  type TestUser,
} from './helpers.js';
import { forgeJwt, now } from './jwt-forge.js';

/** Collects everything the app logs, to prove no secret ever reaches a log. */
class CapturingLogger implements LoggerService {
  readonly lines: string[] = [];
  private push = (...args: unknown[]) =>
    this.lines.push(args.map((a) => JSON.stringify(a) ?? String(a)).join(' '));
  log = this.push;
  error = this.push;
  warn = this.push;
  debug = this.push;
  verbose = this.push;
  fatal = this.push;
}

describe('Auth (e2e)', () => {
  const logs = new CapturingLogger();
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let users: UserFactory;
  /** Every password and token seen in this spec; none may appear in logs. */
  const secrets: string[] = [];

  beforeAll(async () => {
    app = await createTestApp(logs);
    http = request(app.getHttpServer());
    users = new UserFactory(app);
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  async function newUser(role: TestUser['role'] = 'viewer') {
    const u = await users.create(role);
    secrets.push(u.password);
    return u;
  }

  async function login(u: Pick<TestUser, 'username' | 'password'>) {
    const res = await http
      .post('/api/auth/login')
      .send({ username: u.username, password: u.password });
    if (res.status === 200) secrets.push(sessionCookie(res).split('=')[1]);
    return res;
  }

  it('logs in with an HttpOnly, SameSite=Strict cookie and no token in the body', async () => {
    const u = await newUser('surveyor');
    const res = await login(u).then((r) => {
      expect(r.status).toBe(200);
      return r;
    });
    const setCookie = (res.headers['set-cookie'] as unknown as string[]).join(
      ';',
    );
    expect(setCookie).toMatch(/cctv_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(setCookie).toMatch(/Path=\/api/);
    expect(setCookie).toMatch(/Max-Age=28800/); // 8 hours
    expect(setCookie).not.toMatch(/Secure/i); // local dev (COOKIE_SECURE=false)

    const token = sessionCookie(res).split('=')[1];
    expect(JSON.stringify(res.body)).not.toContain(token);
    expect(res.body.user).toEqual({
      id: u.id,
      username: u.username,
      role: 'surveyor',
    });
    expect(Date.parse(res.body.expiresAt) - Date.now()).toBeGreaterThan(
      7.9 * 3600_000,
    );

    const me = await http
      .get('/api/auth/me')
      .set('Cookie', sessionCookie(res))
      .expect(200);
    expect(me.body).toEqual(res.body.user);
  });

  it('normalises the username (case, spaces)', async () => {
    const u = await newUser();
    await login({
      username: `  ${u.username.toUpperCase()} `,
      password: u.password,
    }).then((r) => expect(r.status).toBe(200));
  });

  it('gives the same answer for unknown user, wrong password and inactive user', async () => {
    const u = await newUser();
    const inactive = await newUser();
    await app.get(UsersService).update(inactive.id, { isActive: false });

    const results = await Promise.all([
      login({ username: 'nobody-here', password: 'whatever-password' }),
      login({ username: u.username, password: 'wrong-password-123' }),
      login(inactive),
    ]);
    for (const r of results) {
      expect(r.status).toBe(401);
      expect(r.body.message).toBe('invalid username or password');
      expect(r.headers['set-cookie']).toBeUndefined();
    }
  });

  it('rejects requests without a valid session', async () => {
    const u = await newUser();
    const res = await login(u);
    const [, payloadPart] = sessionCookie(res).split('=')[1].split('.');
    const claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString());
    const secret = process.env.JWT_SECRET!;
    const base = {
      sub: claims.sub,
      jti: claims.jti,
      iss: 'cctv-survey-api',
      aud: 'cctv-survey-web',
      iat: now(),
      exp: now() + 3600,
    };

    const bad = {
      none: '',
      garbage: 'not-a-jwt',
      algNone: forgeJwt(base, { alg: 'none' }),
      wrongKey: forgeJwt(base, {
        secret: 'another-key-that-is-long-enough-123456',
      }),
      expired: forgeJwt(
        { ...base, iat: now() - 7200, exp: now() - 60 },
        { secret },
      ),
      wrongAudience: forgeJwt({ ...base, aud: 'someone-else' }, { secret }),
      unknownSession: forgeJwt(
        { ...base, jti: '00000000-0000-4000-8000-000000000000' },
        { secret },
      ),
      tampered: (() => {
        const [h, , s] = sessionCookie(res).split('=')[1].split('.');
        const p = Buffer.from(
          JSON.stringify({
            ...claims,
            sub: '00000000-0000-4000-8000-000000000001',
          }),
        ).toString('base64url');
        return `${h}.${p}.${s}`;
      })(),
    };
    // The genuine token works; each forgery does not.
    await http
      .get('/api/auth/me')
      .set('Cookie', sessionCookie(res))
      .expect(200);
    for (const [name, token] of Object.entries(bad)) {
      const r = await http
        .get('/api/auth/me')
        .set('Cookie', `cctv_session=${token}`);
      expect({ name, status: r.status }).toEqual({ name, status: 401 });
    }
    // Bearer headers are not accepted either: cookie only.
    await http
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${sessionCookie(res).split('=')[1]}`)
      .expect(401);
  });

  it('logout revokes the session server-side', async () => {
    const u = await newUser();
    const cookie = sessionCookie(await login(u));
    await http.get('/api/auth/me').set('Cookie', cookie).expect(200);

    const out = await http
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .expect(204);
    expect(
      (out.headers['set-cookie'] as unknown as string[]).join(';'),
    ).toMatch(/cctv_session=;.*Expires=Thu, 01 Jan 1970/);

    // Replaying the old cookie no longer works.
    await http.get('/api/auth/me').set('Cookie', cookie).expect(401);
    // Logout without a session is harmless.
    await http.post('/api/auth/logout').expect(204);
  });

  it('change-password verifies the current password and revokes all sessions', async () => {
    const u = await newUser();
    const c1 = sessionCookie(await login(u));
    const c2 = sessionCookie(await login(u));
    const newPassword = 'a-brand-new-password-42';
    secrets.push(newPassword);

    await http
      .post('/api/auth/change-password')
      .set('Cookie', c1)
      .send({ currentPassword: 'not-my-password', newPassword })
      .expect(400);
    await http
      .post('/api/auth/change-password')
      .set('Cookie', c1)
      .send({ currentPassword: u.password, newPassword: 'short' })
      .expect(400);
    await http
      .post('/api/auth/change-password')
      .set('Cookie', c1)
      .send({ currentPassword: u.password, newPassword: u.username })
      .expect(400); // must not equal the username
    await http
      .post('/api/auth/change-password')
      .set('Cookie', c1)
      .send({ currentPassword: u.password, newPassword })
      .expect(204);

    for (const c of [c1, c2]) {
      await http.get('/api/auth/me').set('Cookie', c).expect(401);
    }
    expect((await login(u)).status).toBe(401);
    expect(
      (await login({ username: u.username, password: newPassword })).status,
    ).toBe(200);
  });

  it('only accepts JSON request bodies (415 otherwise)', async () => {
    await http
      .post('/api/auth/login')
      .set('Content-Type', 'text/plain')
      .send('username=a&password=b')
      .expect(415);
    await http
      .post('/api/auth/login')
      .type('form')
      .send({ username: 'a', password: 'b' })
      .expect(415);
  });

  it('rate-limits login attempts per account (6th attempt -> 429)', async () => {
    const target = {
      username: 'rate-limit-target',
      password: 'wrong-password-1',
    };
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await login(target)).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    // A different account from the same client is not blocked.
    const other = await newUser();
    expect((await login(other)).status).toBe(200);
  });

  it('spraying many usernames from one address does not lock everyone out (S1)', async () => {
    // Previously 20 failures from one IP blocked every login for a minute.
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) {
      statuses.push(
        (await login({ username: `spray-${i}`, password: 'wrong-password-1' }))
          .status,
      );
    }
    expect(statuses.every((s) => s === 401)).toBe(true);
    expect((await login(await newUser())).status).toBe(200);
  });

  it('rate-limits change-password per user (6th attempt -> 429) (S2)', async () => {
    const u = await newUser();
    const cookie = sessionCookie(await login(u));
    const attempt = (currentPassword: string) =>
      http
        .post('/api/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword, newPassword: 'guess-new-password-1' });
    for (let i = 0; i < 5; i++) {
      expect((await attempt(`wrong-guess-${i}`)).status).toBe(400);
    }
    // Even the right password is refused once the limit is reached.
    expect((await attempt(u.password)).status).toBe(429);
    await http.get('/api/auth/me').set('Cookie', cookie).expect(200);
  });

  it('a successful login revokes the session the browser already had (S5)', async () => {
    const a = await newUser();
    const b = await newUser();
    const cookieA = sessionCookie(await login(a));

    // A failed login keeps the existing session.
    await http
      .post('/api/auth/login')
      .set('Cookie', cookieA)
      .send({ username: b.username, password: 'wrong-password-1' })
      .expect(401);
    await http.get('/api/auth/me').set('Cookie', cookieA).expect(200);

    // B signs in on the same browser: A's session is revoked server-side.
    const res = await http
      .post('/api/auth/login')
      .set('Cookie', cookieA)
      .send({ username: b.username, password: b.password })
      .expect(200);
    secrets.push(sessionCookie(res).split('=')[1]);
    await http.get('/api/auth/me').set('Cookie', cookieA).expect(401);
    const me = await http
      .get('/api/auth/me')
      .set('Cookie', sessionCookie(res))
      .expect(200);
    expect(me.body.id).toBe(b.id);
  });

  it('never writes passwords or tokens to the log', () => {
    expect(secrets.length).toBeGreaterThan(5);
    const all = logs.lines.join('\n');
    for (const s of secrets) expect(all).not.toContain(s);
  });
});
