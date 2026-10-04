import type { UserRole } from '@cctv/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, loginAgent, UserFactory } from './helpers.js';

type Agent = Awaited<ReturnType<typeof loginAgent>>;
type Method = 'get' | 'post' | 'patch' | 'delete';

interface Seed {
  projectId: string;
  siteId: string;
  cameraId: string;
  userId: string;
}

interface Case {
  name: string;
  method: Method;
  path: (s: Seed) => string;
  body?: (s: Seed, tag: string) => object;
}

const loc = { lat: 13.7563, lng: 100.5018 };

/** Every protected route in the API. */
const ROUTES: Case[] = [
  { name: 'list projects', method: 'get', path: () => '/api/projects' },
  {
    name: 'get project',
    method: 'get',
    path: (s) => `/api/projects/${s.projectId}`,
  },
  {
    name: 'create project',
    method: 'post',
    path: () => '/api/projects',
    body: (_, t) => ({ name: `rbac-${t}` }),
  },
  {
    name: 'update project',
    method: 'patch',
    path: (s) => `/api/projects/${s.projectId}`,
    body: () => ({ notes: 'changed' }),
  },
  {
    name: 'delete project',
    method: 'delete',
    path: (s) => `/api/projects/${s.projectId}`,
  },
  {
    name: 'list sites',
    method: 'get',
    path: (s) => `/api/projects/${s.projectId}/sites`,
  },
  { name: 'get site', method: 'get', path: (s) => `/api/sites/${s.siteId}` },
  {
    name: 'create site',
    method: 'post',
    path: () => '/api/sites',
    body: (s, t) => ({ projectId: s.projectId, name: `site-${t}` }),
  },
  {
    name: 'update site',
    method: 'patch',
    path: (s) => `/api/sites/${s.siteId}`,
    body: () => ({ notes: 'changed' }),
  },
  {
    name: 'delete site',
    method: 'delete',
    path: (s) => `/api/sites/${s.siteId}`,
  },
  {
    name: 'list cameras',
    method: 'get',
    path: (s) => `/api/projects/${s.projectId}/cameras`,
  },
  {
    name: 'get camera',
    method: 'get',
    path: (s) => `/api/cameras/${s.cameraId}`,
  },
  {
    name: 'create camera',
    method: 'post',
    path: () => '/api/cameras',
    body: (s, t) => ({
      projectId: s.projectId,
      label: `C-${t}`,
      type: 'dome',
      location: loc,
    }),
  },
  {
    name: 'update camera',
    method: 'patch',
    path: (s) => `/api/cameras/${s.cameraId}`,
    body: () => ({ notes: 'changed' }),
  },
  {
    name: 'delete camera',
    method: 'delete',
    path: (s) => `/api/cameras/${s.cameraId}`,
  },
  { name: 'list users', method: 'get', path: () => '/api/users' },
  { name: 'get user', method: 'get', path: (s) => `/api/users/${s.userId}` },
  {
    name: 'create user',
    method: 'post',
    path: () => '/api/users',
    body: (_, t) => ({
      username: `rbac-${t}`,
      role: 'viewer',
      password: 'long-enough-password-1',
    }),
  },
  {
    name: 'update user',
    method: 'patch',
    path: (s) => `/api/users/${s.userId}`,
    body: () => ({ displayName: 'x' }),
  },
  {
    name: 'reset password',
    method: 'post',
    path: (s) => `/api/users/${s.userId}/reset-password`,
    body: () => ({ newPassword: 'another-long-password-2' }),
  },
];

const READS = new Set([
  'list projects',
  'get project',
  'list sites',
  'get site',
  'list cameras',
  'get camera',
]);
const SURVEY_WRITES = new Set([
  'create project',
  'update project',
  'create site',
  'update site',
  'delete site',
  'create camera',
  'update camera',
  'delete camera',
]);

/** Engineers add and edit camera points (camera:write) only. */
const ENGINEER_WRITES = new Set(['create camera', 'update camera']);

/** Allowed? per role — mirrors ROLE_PERMISSIONS in packages/shared. */
function allowed(role: UserRole, name: string): boolean {
  if (role === 'admin') return true;
  if (role === 'surveyor') return READS.has(name) || SURVEY_WRITES.has(name);
  if (role === 'engineer') {
    return READS.has(name) || ENGINEER_WRITES.has(name);
  }
  return READS.has(name);
}

describe('Role-based access control (e2e)', () => {
  let app: INestApplication<App>;
  let users: UserFactory;
  let admin: Agent;
  const agents = {} as Record<UserRole, Agent>;
  const cleanup = {
    cameras: [] as string[],
    sites: [] as string[],
    projects: [] as string[],
  };

  beforeAll(async () => {
    app = await createTestApp();
    users = new UserFactory(app);
    admin = await loginAgent(app, await users.create('admin'));
    for (const role of ['admin', 'surveyor', 'engineer', 'viewer'] as const) {
      agents[role] = await loginAgent(app, await users.create(role));
    }
  });

  afterAll(async () => {
    for (const id of cleanup.cameras) await admin.delete(`/api/cameras/${id}`);
    for (const id of cleanup.sites) await admin.delete(`/api/sites/${id}`);
    for (const id of cleanup.projects)
      await admin.delete(`/api/projects/${id}`);
    await users.cleanup();
    await app.close();
  });

  /** A fresh, empty-enough project/site/camera/user for one request. */
  async function seed(tag: string): Promise<Seed> {
    const p = await admin
      .post('/api/projects')
      .send({ name: `rbac-seed-${tag}` })
      .expect(201);
    cleanup.projects.push(p.body.id);
    const s = await admin
      .post('/api/sites')
      .send({ projectId: p.body.id, name: 'S' })
      .expect(201);
    cleanup.sites.push(s.body.id);
    const c = await admin
      .post('/api/cameras')
      .send({
        projectId: p.body.id,
        label: 'SEED',
        type: 'dome',
        location: loc,
      })
      .expect(201);
    cleanup.cameras.push(c.body.id);
    const u = await users.create('viewer');
    return {
      projectId: p.body.id,
      siteId: s.body.id,
      cameraId: c.body.id,
      userId: u.id,
    };
  }

  function send(agent: Agent, c: Case, s: Seed, tag: string) {
    const req = agent[c.method](c.path(s));
    return c.body ? req.send(c.body(s, tag)) : req;
  }

  function track(c: Case, body: { id?: string }) {
    if (!body?.id) return;
    if (c.name === 'create project') cleanup.projects.push(body.id);
    if (c.name === 'create site') cleanup.sites.push(body.id);
    if (c.name === 'create camera') cleanup.cameras.push(body.id);
    if (c.name === 'create user') users.created.push(body.id);
  }

  it('rejects every protected route without a session (401)', async () => {
    const s = await seed('anon');
    const anon = request(app.getHttpServer());
    for (const c of ROUTES) {
      const res = await send(anon, c, s, 'anon');
      expect({ route: c.name, status: res.status }).toEqual({
        route: c.name,
        status: 401,
      });
    }
  });

  for (const role of ['viewer', 'engineer', 'surveyor', 'admin'] as const) {
    it(`${role}: allowed routes succeed, others are 403`, async () => {
      for (const [i, c] of ROUTES.entries()) {
        // Deletes need a target without children, so seed per route.
        const s = await seed(`${role}-${i}`);
        if (c.name === 'delete project') {
          await admin.delete(`/api/cameras/${s.cameraId}`).expect(204);
          await admin.delete(`/api/sites/${s.siteId}`).expect(204);
        }
        if (c.name === 'delete site') {
          await admin
            .patch(`/api/cameras/${s.cameraId}`)
            .send({ siteId: null })
            .expect(200);
        }
        const res = await send(agents[role], c, s, `${role}-${i}`);
        track(c, res.body);
        const ok = allowed(role, c.name);
        expect({ route: c.name, ok: res.status < 300 }).toEqual({
          route: c.name,
          ok,
        });
        if (!ok) expect(res.status).toBe(403);
      }
    });
  }

  it('viewer write attempts leave the data unchanged', async () => {
    const s = await seed('viewer-nochange');
    const before = await admin.get(`/api/projects/${s.projectId}`).expect(200);
    const viewer = agents.viewer;
    await viewer
      .patch(`/api/projects/${s.projectId}`)
      .send({ name: 'hacked' })
      .expect(403);
    await viewer
      .patch(`/api/cameras/${s.cameraId}`)
      .send({ label: 'hacked' })
      .expect(403);
    await viewer.delete(`/api/cameras/${s.cameraId}`).expect(403);
    await viewer
      .post('/api/users')
      .send({
        username: 'viewer-made',
        role: 'admin',
        password: 'long-enough-password-1',
      })
      .expect(403);

    const after = await admin.get(`/api/projects/${s.projectId}`).expect(200);
    expect(after.body).toEqual(before.body);
    const cam = await admin.get(`/api/cameras/${s.cameraId}`).expect(200);
    expect(cam.body.label).toBe('SEED');
    const list = await admin.get('/api/users').expect(200);
    expect(
      list.body.map((u: { username: string }) => u.username),
    ).not.toContain('viewer-made');
  });

  it('403 is decided before validation (no information from bad bodies)', async () => {
    await agents.viewer.post('/api/projects').send({ bogus: true }).expect(403);
  });
});
