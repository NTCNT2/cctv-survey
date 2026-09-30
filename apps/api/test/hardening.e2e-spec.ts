import { INestApplication } from '@nestjs/common';
import { sql } from 'kysely';
import pg from 'pg';
import { App } from 'supertest/types.js';
import { createTestApp, loginAgent, UserFactory } from './helpers.js';
import { Database } from './../src/db/database.js';

// Runs against cctv_survey_test (see setup-e2e.ts). Creates no rows except one
// project, which is deleted in afterAll.
describe('Hardening (e2e)', () => {
  let app: INestApplication<App>;
  let http: Awaited<ReturnType<typeof loginAgent>>;
  let users: UserFactory;
  const created: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    users = new UserFactory(app);
    http = await loginAgent(app, await users.create('admin'));
  });

  afterAll(async () => {
    for (const id of created) await http.delete(`/api/projects/${id}`);
    await users.cleanup();
    await app.close();
  });

  it('survives an idle DB connection being terminated', async () => {
    const db = app.get(Database);
    const { rows } = await sql<{
      pid: number;
    }>`select pg_backend_pid() as pid`.execute(db);
    // Kill only our own (now idle) pool connection from a separate client.
    const admin = new pg.Client({
      connectionString: process.env.DATABASE_URL,
    });
    await admin.connect();
    await admin.query('select pg_terminate_backend($1)', [rows[0].pid]);
    await admin.end();
    await new Promise((r) => setTimeout(r, 300));

    await http.get('/api/projects?limit=1').expect(200);
  });

  it('rejects NUL bytes with 400, not 500', async () => {
    const res = await http
      .post('/api/projects')
      .send({ name: 'nul\u0000byte' });
    expect(res.status).toBe(400);
    if (res.status === 201) created.push(res.body.id);
  });

  it('explains an invalid polygon without leaking constraint names', async () => {
    const res = await http
      .post('/api/projects')
      .send({ name: `bowtie-${Date.now()}` });
    created.push(res.body.id);
    const bad = await http
      .post('/api/sites')
      .send({
        projectId: res.body.id,
        name: 'Bowtie',
        boundary: [
          { lat: 0, lng: 0 },
          { lat: 1, lng: 1 },
          { lat: 0, lng: 1 },
          { lat: 1, lng: 0 },
        ],
      })
      .expect(400);
    expect(bad.body.message).toMatch(/boundary polygon is invalid/);
  });

  it('allows both web origins and hides X-Powered-By', async () => {
    for (const origin of ['http://localhost:3000', 'http://127.0.0.1:3000']) {
      const res = await http
        .options('/api/projects')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST');
      expect(res.headers['access-control-allow-origin']).toBe(origin);
    }
    const evil = await http
      .options('/api/projects')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();

    const res = await http.get('/api/health').expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
