import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { createTestApp, loginAgent, UserFactory } from './helpers.js';

// Runs against cctv_survey_test (see setup-e2e.ts). Every row created here is
// deleted again in afterAll, children first.
describe('Projects / Sites / Cameras CRUD (e2e)', () => {
  let app: INestApplication<App>;
  let http: Awaited<ReturnType<typeof loginAgent>>;
  let users: UserFactory;
  const created = {
    cameras: [] as string[],
    sites: [] as string[],
    projects: [] as string[],
  };
  const tag = `e2e-${Date.now()}`;
  const missing = '00000000-0000-4000-8000-000000000000';

  beforeAll(async () => {
    app = await createTestApp();
    users = new UserFactory(app);
    http = await loginAgent(app, await users.create('admin'));
  });

  afterAll(async () => {
    for (const id of created.cameras) await http.delete(`/api/cameras/${id}`);
    for (const id of created.sites) await http.delete(`/api/sites/${id}`);
    for (const id of created.projects) await http.delete(`/api/projects/${id}`);
    await users.cleanup();
    await app.close();
  });

  async function createProject(body: object = {}) {
    const res = await http
      .post('/api/projects')
      .send({ name: `${tag} project`, ...body })
      .expect(201);
    created.projects.push(res.body.id);
    return res.body;
  }

  describe('projects', () => {
    it('creates, reads, lists and updates with lat/lng round-trip', async () => {
      const p = await createProject({
        customerName: 'ACME',
        location: { lat: 13.7563, lng: 100.5018 },
      });
      expect(p).toMatchObject({
        status: 'draft',
        customerName: 'ACME',
        location: { lat: 13.7563, lng: 100.5018 },
      });

      await http
        .get(`/api/projects/${p.id}`)
        .expect(200)
        .expect((r) => {
          expect(r.body.name).toBe(`${tag} project`);
        });

      const list = await http.get('/api/projects?limit=500').expect(200);
      expect(list.body.map((x: { id: string }) => x.id)).toContain(p.id);

      // PATCH keeps status (no zod default leak) and null clears fields
      await http
        .patch(`/api/projects/${p.id}`)
        .send({ status: 'surveying' })
        .expect(200);
      const upd = await http
        .patch(`/api/projects/${p.id}`)
        .send({ customerName: null, location: null })
        .expect(200);
      expect(upd.body.status).toBe('surveying');
      expect(upd.body.customerName).toBeUndefined();
      expect(upd.body.location).toBeUndefined();
      expect(Date.parse(upd.body.updatedAt)).toBeGreaterThanOrEqual(
        Date.parse(p.updatedAt),
      );
    });

    it('rejects invalid input with 400', async () => {
      await http.post('/api/projects').send({ name: '  ' }).expect(400);
      await http
        .post('/api/projects')
        .send({ name: 'x', status: 'bogus' })
        .expect(400);
      await http
        .post('/api/projects')
        .send({ name: 'x', location: { lat: 100.5, lng: 13.7 } })
        .expect(400);
      await http.patch(`/api/projects/${missing}`).send({}).expect(400);
      await http.get('/api/projects?limit=0').expect(400);
      await http.get('/api/projects/not-a-uuid').expect(400);
    });

    it('returns 404 for unknown ids', async () => {
      await http.get(`/api/projects/${missing}`).expect(404);
      await http
        .patch(`/api/projects/${missing}`)
        .send({ name: 'x' })
        .expect(404);
      await http.delete(`/api/projects/${missing}`).expect(404);
      await http.get(`/api/projects/${missing}/sites`).expect(404);
      await http.get(`/api/projects/${missing}/cameras`).expect(404);
    });
  });

  describe('sites and cameras', () => {
    it('handles polygons, composite FK, unique labels and delete restrictions', async () => {
      const p = await createProject();
      const other = await createProject({ name: `${tag} other` });

      const boundary = [
        { lat: 13.756, lng: 100.5015 },
        { lat: 13.756, lng: 100.5025 },
        { lat: 13.757, lng: 100.5025 },
        { lat: 13.757, lng: 100.5015 },
      ];
      const siteRes = await http
        .post('/api/sites')
        .send({
          projectId: p.id,
          name: 'Building A',
          location: { lat: 13.7565, lng: 100.502 },
          boundary,
        })
        .expect(201);
      const site = siteRes.body;
      created.sites.push(site.id);
      expect(site.boundary).toEqual(boundary); // closed server-side, returned open

      const otherSite = await http
        .post('/api/sites')
        .send({ projectId: other.id, name: 'Other' })
        .expect(201);
      created.sites.push(otherSite.body.id);

      // duplicate site name in same project -> 409
      await http
        .post('/api/sites')
        .send({ projectId: p.id, name: 'Building A' })
        .expect(409);
      // unknown project -> 400
      await http
        .post('/api/sites')
        .send({ projectId: missing, name: 'x' })
        .expect(400);
      // self-intersecting polygon rejected by ST_IsValid check -> 400
      await http
        .post('/api/sites')
        .send({
          projectId: p.id,
          name: 'Bowtie',
          boundary: [
            { lat: 0, lng: 0 },
            { lat: 1, lng: 1 },
            { lat: 0, lng: 1 },
            { lat: 1, lng: 0 },
          ],
        })
        .expect(400);

      const camRes = await http
        .post('/api/cameras')
        .send({
          projectId: p.id,
          siteId: site.id,
          label: 'CAM-01',
          type: 'dome',
          location: { lat: 13.7566, lng: 100.5021 },
          bearingDeg: 90,
          fovDeg: 110,
          poe: true,
        })
        .expect(201);
      const cam = camRes.body;
      created.cameras.push(cam.id);
      expect(cam).toMatchObject({
        siteId: site.id,
        status: 'proposed',
        location: { lat: 13.7566, lng: 100.5021 },
        bearingDeg: 90,
        poe: true,
      });

      // duplicate label in project -> 409; site from another project -> 400
      await http
        .post('/api/cameras')
        .send({
          projectId: p.id,
          label: 'CAM-01',
          type: 'dome',
          location: { lat: 13.7, lng: 100.5 },
        })
        .expect(409);
      await http
        .post('/api/cameras')
        .send({
          projectId: p.id,
          siteId: otherSite.body.id,
          label: 'CAM-X',
          type: 'dome',
          location: { lat: 13.7, lng: 100.5 },
        })
        .expect(400);
      await http
        .patch(`/api/cameras/${cam.id}`)
        .send({ siteId: otherSite.body.id })
        .expect(400);
      await http
        .patch(`/api/cameras/${cam.id}`)
        .send({ bearingDeg: 360 })
        .expect(400);

      // list + filter
      const all = await http.get(`/api/projects/${p.id}/cameras`).expect(200);
      expect(all.body).toHaveLength(1);
      const bySite = await http
        .get(`/api/projects/${p.id}/cameras?siteId=${otherSite.body.id}`)
        .expect(200);
      expect(bySite.body).toHaveLength(0);
      const sites = await http.get(`/api/projects/${p.id}/sites`).expect(200);
      expect(sites.body.map((s: { id: string }) => s.id)).toEqual([site.id]);

      // RESTRICT: parents with children cannot be deleted -> 409
      await http.delete(`/api/sites/${site.id}`).expect(409);
      await http.delete(`/api/projects/${p.id}`).expect(409);

      // detach camera, then the site can go
      const detached = await http
        .patch(`/api/cameras/${cam.id}`)
        .send({ siteId: null })
        .expect(200);
      expect(detached.body.siteId).toBeUndefined();
      await http.delete(`/api/sites/${site.id}`).expect(204);
      await http.get(`/api/sites/${site.id}`).expect(404);
    });
  });
});
