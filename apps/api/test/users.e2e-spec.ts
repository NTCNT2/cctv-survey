import type { INestApplication } from '@nestjs/common';
import { sql } from 'kysely';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { Database } from '../src/db/database.js';
import { createTestApp, loginAgent, UserFactory } from './helpers.js';

describe('User management (e2e)', () => {
  let app: INestApplication<App>;
  let users: UserFactory;
  let admin: Awaited<ReturnType<typeof loginAgent>>;
  let adminId: string;

  beforeAll(async () => {
    app = await createTestApp();
    users = new UserFactory(app);
    const a = await users.create('admin');
    adminId = a.id;
    admin = await loginAgent(app, a);
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  it('creates users without ever returning the password or hash', async () => {
    const res = await admin
      .post('/api/users')
      .send({
        username: '  E2E-Created.User ',
        displayName: 'Field Surveyor',
        role: 'surveyor',
        password: 'a-long-enough-password',
      })
      .expect(201);
    users.created.push(res.body.id);
    expect(res.body).toMatchObject({
      username: 'e2e-created.user',
      displayName: 'Field Surveyor',
      role: 'surveyor',
      isActive: true,
    });
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/password|hash|argon2/i);

    const list = await admin.get('/api/users').expect(200);
    expect(JSON.stringify(list.body)).not.toMatch(/password|hash|argon2/i);
    await admin.get(`/api/users/${res.body.id}`).expect(200);
    await admin
      .get('/api/users/00000000-0000-4000-8000-000000000000')
      .expect(404);

    // Stored as Argon2id
    const db = app.get(Database);
    const row = await db
      .selectFrom('users')
      .select('password_hash')
      .where('id', '=', res.body.id)
      .executeTakeFirstOrThrow();
    expect(row.password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('validates new users', async () => {
    const u = await users.create('viewer');
    const post = (body: object) => admin.post('/api/users').send(body);
    await post({
      username: u.username,
      role: 'viewer',
      password: 'a-long-enough-password',
    }).expect(409);
    await post({
      username: 'ab',
      role: 'viewer',
      password: 'a-long-enough-password',
    }).expect(400);
    await post({
      username: 'bad name!',
      role: 'viewer',
      password: 'a-long-enough-password',
    }).expect(400);
    await post({
      username: 'e2e-shortpw',
      role: 'viewer',
      password: 'short',
    }).expect(400);
    await post({
      username: 'e2e-samepassword',
      role: 'viewer',
      password: 'e2e-samepassword',
    }).expect(400);
    await post({
      username: 'e2e-badrole',
      role: 'root',
      password: 'a-long-enough-password',
    }).expect(400);
    await post({
      username: 'e2e-toolong',
      role: 'viewer',
      password: 'x'.repeat(129),
    }).expect(400);
  });

  it('role changes and deactivation take effect immediately', async () => {
    const u = await users.create('viewer');
    const agent = await loginAgent(app, u);
    await agent.post('/api/projects').send({ name: 'nope' }).expect(403);

    await admin
      .patch(`/api/users/${u.id}`)
      .send({ role: 'surveyor' })
      .expect(200);
    const created = await agent
      .post('/api/projects')
      .send({ name: `promoted-${u.id}` })
      .expect(201);
    await admin.delete(`/api/projects/${created.body.id}`).expect(204);

    await admin
      .patch(`/api/users/${u.id}`)
      .send({ isActive: false })
      .expect(200);
    await agent.get('/api/auth/me').expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: u.username, password: u.password })
      .expect(401);

    // Reactivating does not revive the old session.
    await admin
      .patch(`/api/users/${u.id}`)
      .send({ isActive: true })
      .expect(200);
    await agent.get('/api/auth/me').expect(401);
  });

  it('admin password reset revokes sessions', async () => {
    const u = await users.create('surveyor');
    const agent = await loginAgent(app, u);
    await admin
      .post(`/api/users/${u.id}/reset-password`)
      .send({ newPassword: u.username })
      .expect(400);
    await admin
      .post(`/api/users/${u.id}/reset-password`)
      .send({ newPassword: 'reset-by-admin-123' })
      .expect(204);
    await agent.get('/api/auth/me').expect(401);
    await loginAgent(app, {
      username: u.username,
      password: 'reset-by-admin-123',
    });
  });

  it('an admin cannot reset their own password without the current one (S4)', async () => {
    const res = await admin
      .post(`/api/users/${adminId}/reset-password`)
      .send({ newPassword: 'self-reset-attempt-1' })
      .expect(400);
    expect(res.body.message).toMatch(/change-password/);
    await admin.get('/api/auth/me').expect(200); // session untouched
  });

  it('protects the last active admin', async () => {
    const db = app.get(Database);
    const { rows } = await sql<{ n: number }>`
      select count(*)::int as n from users where role = 'admin' and is_active and id <> ${adminId}
    `.execute(db);
    // Other specs clean up their admins, so this spec's admin is the only one.
    expect(rows[0].n).toBe(0);

    await admin
      .patch(`/api/users/${adminId}`)
      .send({ role: 'surveyor' })
      .expect(409);
    await admin
      .patch(`/api/users/${adminId}`)
      .send({ isActive: false })
      .expect(409);
    await admin
      .patch(`/api/users/${adminId}`)
      .send({ displayName: 'Still Admin' })
      .expect(200);

    // With a second admin, the first may step down…
    const second = await users.create('admin');
    const secondAgent = await loginAgent(app, second);
    await admin
      .patch(`/api/users/${adminId}`)
      .send({ role: 'surveyor' })
      .expect(200);
    await admin.get('/api/users').expect(403); // role change is immediate

    // …but now the second is the last one.
    await secondAgent
      .patch(`/api/users/${second.id}`)
      .send({ isActive: false })
      .expect(409);
    await secondAgent
      .patch(`/api/users/${second.id}`)
      .send({ role: 'viewer' })
      .expect(409);

    // Concurrent demotions of two admins: exactly one wins. The loser gets 409
    // (last admin) or 403 (it was demoted a moment earlier) — never 200.
    await secondAgent
      .patch(`/api/users/${adminId}`)
      .send({ role: 'admin' })
      .expect(200);
    const [r1, r2] = await Promise.all([
      secondAgent.patch(`/api/users/${adminId}`).send({ role: 'viewer' }),
      admin.patch(`/api/users/${second.id}`).send({ role: 'viewer' }),
    ]);
    const statuses = [r1.status, r2.status];
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.find((s) => s !== 200)).toBeOneOf([403, 409]);
    const left = await sql<{ n: number }>`
      select count(*)::int as n from users where role = 'admin' and is_active
    `.execute(db);
    expect(left.rows[0].n).toBe(1);
  });
});
