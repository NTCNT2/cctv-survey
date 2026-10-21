import type { CameraListItem, DashboardSummary } from '@cctv/shared';
import { DASHBOARD_DAYS, DASHBOARD_TIME_ZONE } from '@cctv/shared';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { createTestApp, loginAgent, UserFactory } from './helpers.js';

type Agent = Awaited<ReturnType<typeof loginAgent>>;

/** Local calendar day (YYYY-MM-DD) of an instant, as the dashboard counts it. */
const localDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: DASHBOARD_TIME_ZONE }).format(d);

const DAY = 24 * 3600 * 1000;

// Spec files run one at a time, so dashboard counts can be compared as
// before/after deltas. Every row created here is deleted in afterAll.
describe('Cross-project cameras and dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let users: UserFactory;
  let admin: Agent;
  let surveyor: Agent;
  let surveyorId: string;
  const created = { cameras: [] as string[], projects: [] as string[] };
  const tag = `e2e-ov-${Date.now()}`;

  beforeAll(async () => {
    app = await createTestApp();
    users = new UserFactory(app);
    admin = await loginAgent(app, await users.create('admin'));
    const s = await users.create('surveyor');
    surveyorId = s.id;
    surveyor = await loginAgent(app, s);
  });

  afterAll(async () => {
    for (const id of created.cameras) await admin.delete(`/api/cameras/${id}`);
    for (const id of created.projects)
      await admin.delete(`/api/projects/${id}`);
    await users.cleanup();
    await app.close();
  });

  async function project(name: string, status = 'surveying') {
    const res = await admin
      .post('/api/projects')
      .send({ name: `${tag} ${name}`, status })
      .expect(201);
    created.projects.push(res.body.id);
    return res.body.id as string;
  }

  async function camera(agent: Agent, projectId: string, body: object) {
    const res = await agent
      .post('/api/cameras')
      .send({
        projectId,
        type: 'dome',
        location: { lat: 13.75, lng: 100.5 },
        ...body,
      })
      .expect(201);
    created.cameras.push(res.body.id);
    return res.body.id as string;
  }

  describe('GET /api/cameras', () => {
    let p1: string;
    let p2: string;
    const ids: string[] = [];

    beforeAll(async () => {
      p1 = await project('one');
      p2 = await project('two');
      ids.push(await camera(admin, p1, { label: 'A-1', status: 'surveyed' }));
      ids.push(await camera(surveyor, p1, { label: 'A-2', status: 'issue' }));
      ids.push(
        await camera(surveyor, p2, { label: 'B-1', status: 'pending_survey' }),
      );
    });

    it('lists across projects, newest change first, with the project name', async () => {
      // Touch A-1 last: it must come first.
      await admin
        .patch(`/api/cameras/${ids[0]}`)
        .send({ notes: 'touched' })
        .expect(200);
      const res = await admin.get('/api/cameras?limit=500').expect(200);
      const mine = (res.body as CameraListItem[]).filter((c) =>
        ids.includes(c.id),
      );
      expect(mine.map((c) => c.label)).toEqual(['A-1', 'B-1', 'A-2']);
      expect(mine[0]).toMatchObject({
        projectId: p1,
        projectName: `${tag} one`,
        notes: 'touched',
      });
      expect(mine[1].projectName).toBe(`${tag} two`);
      expect(mine[2].surveyorId).toBe(surveyorId);
      const updated = (res.body as CameraListItem[]).map((c) => c.updatedAt);
      expect([...updated].sort().reverse()).toEqual(updated);
    });

    it('filters by project, status and surveyor', async () => {
      const byProject = await admin
        .get(`/api/cameras?projectId=${p1}`)
        .expect(200);
      expect(byProject.body.map((c: CameraListItem) => c.label).sort()).toEqual(
        ['A-1', 'A-2'],
      );
      const byStatus = await admin
        .get(`/api/cameras?projectId=${p1}&status=issue`)
        .expect(200);
      expect(byStatus.body.map((c: CameraListItem) => c.label)).toEqual([
        'A-2',
      ]);
      const bySurveyor = await admin
        .get(`/api/cameras?surveyorId=${surveyorId}`)
        .expect(200);
      expect(
        bySurveyor.body.map((c: CameraListItem) => c.label).sort(),
      ).toEqual(['A-2', 'B-1']);
    });

    it('pages without overlap', async () => {
      const page = (offset: number) =>
        admin.get(`/api/cameras?projectId=${p1}&limit=1&offset=${offset}`);
      const [a, b, c] = await Promise.all([page(0), page(1), page(2)]);
      expect(a.body).toHaveLength(1);
      expect(b.body).toHaveLength(1);
      expect(c.body).toHaveLength(0);
      expect(a.body[0].id).not.toBe(b.body[0].id);
    });

    it('rejects bad queries', async () => {
      for (const q of [
        'limit=501',
        'limit=0',
        'offset=-1',
        'status=proposed',
        'projectId=nope',
        'surveyorId=123',
      ]) {
        const res = await admin.get(`/api/cameras?${q}`);
        expect({ q, status: res.status }).toEqual({ q, status: 400 });
      }
    });
  });

  describe('GET /api/dashboard', () => {
    const get = async () =>
      (await admin.get('/api/dashboard').expect(200)).body as DashboardSummary;

    it('counts projects, cameras, units and survey days exactly', async () => {
      const before = await get();
      expect(before.surveyedByDay).toHaveLength(DASHBOARD_DAYS);
      expect(before.surveyedByDay.at(-1)!.date).toBe(localDay(new Date()));

      const p = await project('dash', 'designed');
      const now = Date.now();
      // Yesterday 23:30 local time (UTC+7): yesterday, not today.
      const yesterday = localDay(new Date(now - DAY));
      const lateYesterday = `${yesterday}T23:30:00+07:00`;
      const old = new Date(now - (DASHBOARD_DAYS + 2) * DAY).toISOString();
      await camera(surveyor, p, { label: 'D-1', cameraCount: 4 });
      await camera(surveyor, p, {
        label: 'D-2',
        type: 'ptz',
        status: 'issue',
        surveyedAt: lateYesterday,
      });
      await camera(admin, p, { label: 'D-3', surveyedAt: old });

      const after = await get();
      expect(after.projects.total - before.projects.total).toBe(1);
      const n = (o: Partial<Record<string, number>>, k: string) => o[k] ?? 0;
      expect(
        n(after.projects.byStatus, 'designed') -
          n(before.projects.byStatus, 'designed'),
      ).toBe(1);
      expect(after.cameras.points - before.cameras.points).toBe(3);
      expect(after.cameras.units - before.cameras.units).toBe(6); // 4 + 1 + 1
      expect(
        n(after.cameras.byStatus, 'issue') -
          n(before.cameras.byStatus, 'issue'),
      ).toBe(1);
      expect(
        n(after.cameras.byType, 'ptz') - n(before.cameras.byType, 'ptz'),
      ).toBe(1);

      const day = (s: DashboardSummary, d: string) =>
        s.surveyedByDay.find((x) => x.date === d)?.points ?? 0;
      const today = localDay(new Date());
      expect(day(after, today) - day(before, today)).toBe(1);
      expect(day(after, yesterday) - day(before, yesterday)).toBe(1);
      // The old one is outside the period: the total grows by 2, not 3.
      const sum = (s: DashboardSummary) =>
        s.surveyedByDay.reduce((a, b) => a + b.points, 0);
      expect(sum(after) - sum(before)).toBe(2);

      const mine = (s: DashboardSummary) =>
        s.surveyors.find((x) => x.userId === surveyorId)?.points ?? 0;
      expect(mine(after) - mine(before)).toBe(2);
    });

    it('never exposes more than names and counts', async () => {
      const body = JSON.stringify(await get());
      expect(body).not.toMatch(/password|hash|username|argon2/i);
    });
  });
});
