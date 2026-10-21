import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { createTestApp, loginAgent, UserFactory } from './helpers.js';
import { Database } from '../src/db/database.js';

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

  describe('camera survey fields (0004)', () => {
    it('stores every survey field, sets the surveyor from the session', async () => {
      const p = await createProject();
      const me = await http.get('/api/auth/me').expect(200);
      const res = await http
        .post('/api/cameras')
        .send({
          projectId: p.id,
          label: 'CCTV-001',
          type: 'bullet',
          location: { lat: 13.75, lng: 100.5 },
          gpsAccuracyM: 3.4,
          address: 'หน้าอาคาร A',
          brand: 'Sony',
          model: 'XYZ',
          resolutionMp: 4,
          cameraCount: 2,
          bearingDeg: 75,
          fovDeg: 90,
          viewDistanceM: 30,
          purpose: 'entrance',
          mountHeightM: 6,
          structureType: 'new_pole',
          poleHeightM: 6,
          cabinetDistanceM: 125,
          cableLengthM: 140,
          powerAvailable: true,
          networkType: 'sim',
          // Not accepted from the client: stripped by the schema.
          surveyorId: '00000000-0000-4000-8000-000000000000',
          // No longer accepted (0008): stripped too, never an error.
          mountType: 'wall',
          poe: true,
          fiberAvailable: true,
          networkAvailable: true,
        })
        .expect(201);
      created.cameras.push(res.body.id);
      expect(res.body).toMatchObject({
        status: 'surveyed',
        gpsAccuracyM: 3.4,
        address: 'หน้าอาคาร A',
        brand: 'Sony',
        cameraCount: 2,
        viewDistanceM: 30,
        purpose: 'entrance',
        structureType: 'new_pole',
        poleHeightM: 6,
        cabinetDistanceM: 125,
        powerAvailable: true,
        networkType: 'sim',
        surveyorId: me.body.id,
        surveyorName: me.body.displayName ?? me.body.username,
      });
      expect(Date.now() - Date.parse(res.body.surveyedAt)).toBeLessThan(60_000);
      for (const k of [
        'mountType',
        'poe',
        'fiberAvailable',
        'networkAvailable',
      ]) {
        expect(res.body[k]).toBeUndefined();
      }
      // The retired columns were not written either.
      const db = app.get(Database);
      const row = await db
        .selectFrom('camera_points')
        .select(['mount_type', 'poe', 'fiber_available', 'network_available'])
        .where('id', '=', res.body.id)
        .executeTakeFirstOrThrow();
      expect(row).toEqual({
        mount_type: null,
        poe: null,
        fiber_available: null,
        network_available: null,
      });

      // PATCH: null clears, cameraCount keeps its value when absent.
      const upd = await http
        .patch(`/api/cameras/${res.body.id}`)
        .send({
          status: 'pending_design',
          brand: null,
          purpose: null,
          networkType: 'fiber',
        })
        .expect(200);
      expect(upd.body).toMatchObject({
        status: 'pending_design',
        cameraCount: 2,
        networkType: 'fiber',
      });
      const cleared = await http
        .patch(`/api/cameras/${res.body.id}`)
        .send({ networkType: null })
        .expect(200);
      expect(cleared.body.networkType).toBeUndefined();
      expect(upd.body.brand).toBeUndefined();
      expect(upd.body.purpose).toBeUndefined();
      expect(upd.body.surveyorId).toBe(me.body.id);

      const list = await http.get(`/api/projects/${p.id}/cameras`).expect(200);
      expect(list.body[0].surveyorName).toBe(res.body.surveyorName);
    });

    it('rejects old statuses and out-of-range survey values', async () => {
      const p = await createProject();
      const base = {
        projectId: p.id,
        label: 'BAD',
        type: 'dome',
        location: { lat: 13.75, lng: 100.5 },
      };
      for (const bad of [
        { status: 'proposed' },
        { cameraCount: 0 },
        { purpose: 'garden' },
        { structureType: 'tree' },
        { gpsAccuracyM: -1 },
        { surveyedAt: 'yesterday' },
        { networkType: 'lte' },
        { networkType: 'FIBER' },
      ]) {
        await http
          .post('/api/cameras')
          .send({ ...base, ...bad })
          .expect(400);
      }
    });
  });

  describe('survey detail fields (0007)', () => {
    it('stores, updates and clears cabinet location, site conditions and issues', async () => {
      const p = await createProject();
      const res = await http
        .post('/api/cameras')
        .send({
          projectId: p.id,
          label: 'CCTV-007',
          type: 'dome',
          location: { lat: 13.75, lng: 100.5 },
          cabinetLocation: '  ใต้บันไดอาคาร B  ',
          siteConditions: 'ต้นไม้บัง',
        })
        .expect(201);
      created.cameras.push(res.body.id);
      expect(res.body).toMatchObject({
        cabinetLocation: 'ใต้บันไดอาคาร B',
        siteConditions: 'ต้นไม้บัง',
      });
      expect(res.body.siteIssues).toBeUndefined();

      // PATCH only the issues: the other two keep their values.
      const upd = await http
        .patch(`/api/cameras/${res.body.id}`)
        .send({ siteIssues: 'ขอเพิ่มไฟส่องสว่าง' })
        .expect(200);
      expect(upd.body).toMatchObject({
        cabinetLocation: 'ใต้บันไดอาคาร B',
        siteConditions: 'ต้นไม้บัง',
        siteIssues: 'ขอเพิ่มไฟส่องสว่าง',
      });

      // null clears; the list carries the fields as well.
      await http
        .patch(`/api/cameras/${res.body.id}`)
        .send({ siteConditions: null })
        .expect(200);
      const got = await http.get(`/api/cameras/${res.body.id}`).expect(200);
      expect(got.body.siteConditions).toBeUndefined();
      expect(got.body.siteIssues).toBe('ขอเพิ่มไฟส่องสว่าง');
      const list = await http.get(`/api/projects/${p.id}/cameras`).expect(200);
      expect(list.body[0].cabinetLocation).toBe('ใต้บันไดอาคาร B');
    });

    it('rejects text that is too long', async () => {
      const p = await createProject();
      const base = {
        projectId: p.id,
        label: 'LONG',
        type: 'dome',
        location: { lat: 13.75, lng: 100.5 },
      };
      for (const bad of [
        { cabinetLocation: 'x'.repeat(501) },
        { siteConditions: 'x'.repeat(2001) },
        { siteIssues: 'x'.repeat(2001) },
      ]) {
        await http
          .post('/api/cameras')
          .send({ ...base, ...bad })
          .expect(400);
      }
    });
  });

  describe('projects', () => {
    it('counts camera points per status in list and detail', async () => {
      const p = await createProject();
      const add = async (label: string, status?: string) => {
        const res = await http
          .post('/api/cameras')
          .send({
            projectId: p.id,
            label,
            type: 'dome',
            location: { lat: 13.75, lng: 100.5 },
            ...(status && { status }),
          })
          .expect(201);
        created.cameras.push(res.body.id);
        return res.body.id as string;
      };
      await add('C-1');
      await add('C-2');
      const third = await add('C-3', 'installed');

      const one = await http.get(`/api/projects/${p.id}`).expect(200);
      expect(one.body.cameras).toEqual({
        total: 3,
        byStatus: { surveyed: 2, installed: 1 },
      });

      await http.delete(`/api/cameras/${third}`).expect(204);
      const list = await http.get('/api/projects?limit=500').expect(200);
      const row = list.body.find((x: { id: string }) => x.id === p.id);
      expect(row.cameras).toEqual({ total: 2, byStatus: { surveyed: 2 } });
    });

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

      // Reads carry a camera summary; a new project has none.
      const listed = list.body.find((x: { id: string }) => x.id === p.id);
      expect(listed.cameras).toEqual({ total: 0, byStatus: {} });

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
          powerAvailable: true,
        })
        .expect(201);
      const cam = camRes.body;
      created.cameras.push(cam.id);
      expect(cam).toMatchObject({
        siteId: site.id,
        status: 'surveyed',
        location: { lat: 13.7566, lng: 100.5021 },
        bearingDeg: 90,
        powerAvailable: true,
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
