import { PHOTO_MAX_BYTES } from '@cctv/shared';
import { INestApplication } from '@nestjs/common';
import { sql } from 'kysely';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { Database } from '../src/db/database.js';
import { PhotoStorage } from '../src/photos/photo-storage.js';
import { createTestApp, loginAgent, UserFactory } from './helpers.js';

type Agent = Awaited<ReturnType<typeof loginAgent>>;

/** A real image of the given size and format, made in memory. */
const image = (
  width: number,
  height: number,
  format: 'jpeg' | 'png' = 'jpeg',
) =>
  sharp({
    create: { width, height, channels: 3, background: '#3b82f6' },
  })
    [format]()
    .toBuffer();

// Runs against cctv_survey_test with UPLOAD_DIR in a temp dir (setup-e2e.ts).
describe('Camera models and photos (e2e, 0005)', () => {
  let app: INestApplication<App>;
  let users: UserFactory;
  let admin: Agent;
  let surveyor: Agent;
  let engineer: Agent;
  let viewer: Agent;
  const tag = `e2e-${Date.now()}`;
  const created = { models: [] as string[], projects: [] as string[] };
  const missing = '00000000-0000-4000-8000-000000000000';
  let projectId: string;

  beforeAll(async () => {
    app = await createTestApp();
    users = new UserFactory(app);
    admin = await loginAgent(app, await users.create('admin'));
    surveyor = await loginAgent(app, await users.create('surveyor'));
    engineer = await loginAgent(app, await users.create('engineer'));
    viewer = await loginAgent(app, await users.create('viewer'));
    const p = await admin
      .post('/api/projects')
      .send({ name: `${tag} project` })
      .expect(201);
    projectId = p.body.id;
    created.projects.push(projectId);
  });

  afterAll(async () => {
    for (const id of created.projects) {
      const cams = await admin.get(`/api/projects/${id}/cameras`);
      for (const c of cams.body as { id: string }[]) {
        await admin.delete(`/api/cameras/${c.id}`);
      }
      await admin.delete(`/api/projects/${id}`);
    }
    // The API never deletes camera models; the test database may.
    const db = app.get(Database);
    const { rows } = await sql<{
      db: string;
    }>`select current_database() as db`.execute(db);
    if (!rows[0].db.endsWith('_test')) throw new Error('not the test DB');
    if (created.models.length > 0) {
      await db
        .deleteFrom('camera_models')
        .where('id', 'in', created.models)
        .execute();
    }
    await users.cleanup();
    await app.close();
  });

  async function createModel(body: object) {
    const res = await admin.post('/api/camera-models').send(body).expect(201);
    created.models.push(res.body.id);
    return res.body as { id: string; brand: string; model: string };
  }

  const newCamera = (http: Agent, body: object) =>
    http.post('/api/cameras').send({
      projectId,
      location: { lat: 15.12345, lng: 100.54321 },
      ...body,
    });

  describe('camera models', () => {
    it('admin adds and edits models; others may only read', async () => {
      const brand = `Hikvision ${tag}`;
      const m = await createModel({
        brand,
        model: 'IPC2122LB-AF28-ECO',
        cameraType: 'dome',
        resolutionMp: 5,
      });
      expect(m).toMatchObject({
        brand,
        model: 'IPC2122LB-AF28-ECO',
        cameraType: 'dome',
        resolutionMp: 5,
        active: true,
        usedBy: 0,
      });

      // Same brand + model, other case: duplicate
      const dup = await admin
        .post('/api/camera-models')
        .send({
          brand: brand.toUpperCase(),
          model: 'ipc2122lb-af28-eco',
          cameraType: 'dome',
        })
        .expect(409);
      expect(dup.body.message).toBe('this camera model already exists');

      await admin
        .post('/api/camera-models')
        .send({ brand: ' ', model: 'X', cameraType: 'dome' })
        .expect(400);
      await admin
        .post('/api/camera-models')
        .send({ brand, model: 'X', cameraType: 'zoom' })
        .expect(400);

      for (const http of [surveyor, engineer, viewer]) {
        await http
          .post('/api/camera-models')
          .send({ brand, model: 'NOPE', cameraType: 'bullet' })
          .expect(403);
        await http
          .patch(`/api/camera-models/${m.id}`)
          .send({ active: false })
          .expect(403);
        await http.get('/api/camera-models').expect(200);
      }

      const edited = await admin
        .patch(`/api/camera-models/${m.id}`)
        .send({ resolutionMp: 4 })
        .expect(200);
      expect(edited.body.resolutionMp).toBe(4);
      await admin
        .patch(`/api/camera-models/${missing}`)
        .send({ active: false })
        .expect(404);
      // No delete route: deactivate instead.
      await admin.delete(`/api/camera-models/${m.id}`).expect(404);
    });

    it('lists only active models unless all=true', async () => {
      const brand = `Dahua ${tag}`;
      const on = await createModel({
        brand,
        model: 'ON-1',
        cameraType: 'bullet',
        resolutionMp: 8,
      });
      const off = await createModel({
        brand,
        model: 'OFF-1',
        cameraType: 'bullet',
      });
      await admin
        .patch(`/api/camera-models/${off.id}`)
        .send({ active: false })
        .expect(200);

      const ids = (r: request.Response) =>
        (r.body as { id: string }[]).map((x) => x.id);
      const active = await surveyor.get('/api/camera-models').expect(200);
      expect(ids(active)).toContain(on.id);
      expect(ids(active)).not.toContain(off.id);
      const all = await admin.get('/api/camera-models?all=true').expect(200);
      expect(ids(all)).toEqual(expect.arrayContaining([on.id, off.id]));
      const onlyOn = await viewer
        .get('/api/camera-models?active=true')
        .expect(200);
      expect(ids(onlyOn)).toContain(on.id);
      expect(ids(onlyOn)).not.toContain(off.id);
      const onlyOff = await viewer
        .get('/api/camera-models?active=false')
        .expect(200);
      expect(ids(onlyOff)).toContain(off.id);
      expect(ids(onlyOff)).not.toContain(on.id);
      await admin.get('/api/camera-models?all=yes').expect(400);
      await admin.get('/api/camera-models?active=1').expect(400);
      await admin.get('/api/camera-models?all=true&active=true').expect(400);
    });
  });

  describe('camera points with a model', () => {
    it('Quick Add: model fills brand / model / type / MP; no survey detail needed', async () => {
      const m = await createModel({
        brand: `Hikvision ${tag} QA`,
        model: 'DS-2CD1143',
        cameraType: 'turret',
        resolutionMp: 4,
      });
      const res = await newCamera(surveyor, {
        label: 'CCTV-QA-1',
        cameraModelId: m.id,
        gpsAccuracyM: 2,
        // Ignored: the model wins.
        brand: 'Other',
        type: 'ptz',
      }).expect(201);
      expect(res.body).toMatchObject({
        label: 'CCTV-QA-1',
        cameraModelId: m.id,
        cameraModelActive: true,
        brand: m.brand,
        model: 'DS-2CD1143',
        type: 'turret',
        resolutionMp: 4,
        status: 'surveyed',
        gpsAccuracyM: 2,
        photoCount: 0,
        cameraCount: 1,
      });
      expect(res.body.surveyedAt).toBeDefined();
      expect(res.body.cameraModel).toEqual({
        id: m.id,
        brand: m.brand,
        model: 'DS-2CD1143',
        cameraType: 'turret',
        resolutionMp: 4,
        active: true,
      });
      for (const k of [
        'bearingDeg',
        'fovDeg',
        'mountHeightM',
        'notes',
        'networkType',
      ]) {
        expect(res.body[k]).toBeUndefined();
      }
      const listed = await admin.get('/api/camera-models?all=true').expect(200);
      expect(
        (listed.body as { id: string; usedBy: number }[]).find(
          (x) => x.id === m.id,
        )?.usedBy,
      ).toBe(1);
    });

    it('needs a type or a model; rejects unknown and inactive models', async () => {
      await newCamera(surveyor, { label: 'CCTV-NT' }).expect(400);
      await newCamera(surveyor, { label: 'CCTV-NT', type: 'dome' }).expect(201);
      const unknown = await newCamera(surveyor, {
        label: 'CCTV-UK',
        cameraModelId: missing,
      }).expect(400);
      expect(unknown.body.message).toBe('cameraModelId does not exist');

      const m = await createModel({
        brand: `Old ${tag}`,
        model: 'OLD-1',
        cameraType: 'box',
      });
      await admin.patch(`/api/camera-models/${m.id}`).send({ active: false });
      const inactive = await newCamera(surveyor, {
        label: 'CCTV-IN',
        cameraModelId: m.id,
      }).expect(400);
      expect(inactive.body.message).toBe('camera model is inactive');
    });

    it('existing points keep their camera when the model is deactivated or edited', async () => {
      const m = await createModel({
        brand: `Keep ${tag}`,
        model: 'K-5',
        cameraType: 'dome',
        resolutionMp: 5,
      });
      const cam = await newCamera(surveyor, {
        label: 'CCTV-KEEP',
        cameraModelId: m.id,
        gpsAccuracyM: 3,
      }).expect(201);
      const before = cam.body;

      await admin
        .patch(`/api/camera-models/${m.id}`)
        .send({ active: false, resolutionMp: 8, model: 'K-8' })
        .expect(200);

      const after = await viewer.get(`/api/cameras/${before.id}`).expect(200);
      // The master shows its new values; the point keeps its own copy.
      expect(after.body.cameraModel).toMatchObject({
        model: 'K-8',
        resolutionMp: 8,
        active: false,
      });
      expect(after.body).toMatchObject({
        cameraModelId: m.id,
        cameraModelActive: false,
        brand: before.brand,
        model: 'K-5',
        type: 'dome',
        resolutionMp: 5,
      });
      // GPS, status and timestamps untouched by model changes.
      for (const k of [
        'location',
        'gpsAccuracyM',
        'surveyedAt',
        'status',
        'createdAt',
        'updatedAt',
      ]) {
        expect(after.body[k]).toEqual(before[k]);
      }

      // The point may be edited and even keep its (now inactive) model …
      const kept = await surveyor
        .patch(`/api/cameras/${before.id}`)
        .send({ cameraModelId: m.id, notes: 'ยังใช้รุ่นเดิม' })
        .expect(200);
      expect(kept.body).toMatchObject({ model: 'K-8', resolutionMp: 8 });
      // … but another point may not pick it up.
      const other = await newCamera(surveyor, {
        label: 'CCTV-OTHER',
        type: 'dome',
      }).expect(201);
      await surveyor
        .patch(`/api/cameras/${other.body.id}`)
        .send({ cameraModelId: m.id })
        .expect(400);

      // Unlinking keeps the copied values.
      const unlinked = await surveyor
        .patch(`/api/cameras/${before.id}`)
        .send({ cameraModelId: null })
        .expect(200);
      expect(unlinked.body.cameraModelId).toBeUndefined();
      expect(unlinked.body.cameraModel).toBeUndefined();
      expect(unlinked.body.model).toBe('K-8');
    });
  });

  describe('photos', () => {
    let cameraId: string;
    let otherCameraId: string;

    beforeAll(async () => {
      const res = await newCamera(surveyor, {
        label: 'CCTV-PH',
        type: 'dome',
      }).expect(201);
      cameraId = res.body.id;
      const other = await newCamera(surveyor, {
        label: 'CCTV-PH-OTHER',
        type: 'dome',
      }).expect(201);
      otherCameraId = other.body.id;
    });

    const upload = (
      http: Agent,
      id: string,
      body: Buffer,
      type = 'image/jpeg',
      query = '',
    ) =>
      http
        .post(`/api/cameras/${id}/photos${query}`)
        .set('Content-Type', type)
        .send(body);

    /** Full binary body of a GET. */
    const download = (http: Agent, url: string) =>
      http
        .get(url)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        });

    const fileOf = async (
      photoId: string,
      column: 'file_key' | 'thumb_key',
    ) => {
      const row = await app
        .get(Database)
        .selectFrom('camera_photos')
        .select(['file_key', 'thumb_key'])
        .where('id', '=', photoId)
        .executeTakeFirstOrThrow();
      return app.get(PhotoStorage).resolve(row[column]);
    };

    it('uploads with type + caption, resizes, makes a thumbnail, lists, serves', async () => {
      const png = await image(2400, 1200, 'png');
      const res = await upload(
        surveyor,
        cameraId,
        png,
        'image/png',
        `?type=pole_structure&caption=${encodeURIComponent('เสาไฟหน้าเทศบาล')}`,
      ).expect(201);
      const base = `/api/cameras/${cameraId}/photos/${res.body.id}/file`;
      expect(res.body).toMatchObject({
        cameraPointId: cameraId,
        contentType: 'image/jpeg',
        width: 1920,
        height: 960,
        photoType: 'pole_structure',
        caption: 'เสาไฟหน้าเทศบาล',
        url: base,
        thumbUrl: `${base}?size=thumb`,
      });
      expect(res.body.fileSize).toBeGreaterThan(0);
      expect(res.body.createdBy).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.body.createdByName).toMatch(/^e2e-surveyor-/);

      // Stored on disk under a generated key, not in the database.
      const key = await fileOf(res.body.id, 'file_key');
      expect(key).toMatch(/\/photos\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
      expect(existsSync(key)).toBe(true);
      expect(statSync(key).size).toBe(res.body.fileSize);

      const list = await viewer
        .get(`/api/cameras/${cameraId}/photos`)
        .expect(200);
      expect(list.body).toHaveLength(1);
      const cam = await viewer.get(`/api/cameras/${cameraId}`).expect(200);
      expect(cam.body.photoCount).toBe(1);

      const file = await download(viewer, res.body.url).expect(200);
      expect(file.headers['content-type']).toBe('image/jpeg');
      expect(file.headers['cache-control']).toBe('no-store');
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      expect(file.headers['content-security-policy']).toContain('sandbox');
      const meta = await sharp(file.body as Buffer).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual([
        'jpeg',
        1920,
        960,
      ]);

      const thumb = await download(viewer, res.body.thumbUrl).expect(200);
      const tm = await sharp(thumb.body as Buffer).metadata();
      expect([tm.format, tm.width, tm.height]).toEqual(['jpeg', 360, 180]);
      await viewer.get(`${base}?size=huge`).expect(400);
    });

    it('applies the EXIF orientation (portrait photo stays portrait)', async () => {
      // Pixels stored landscape 400×200 with "rotate 90° CW" (6) in EXIF.
      const tagged = await sharp(await image(400, 200))
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toBuffer();
      const res = await upload(surveyor, cameraId, tagged).expect(201);
      expect([res.body.width, res.body.height]).toEqual([200, 400]);
      const file = await download(viewer, res.body.url).expect(200);
      const meta = await sharp(file.body as Buffer).metadata();
      expect([meta.width, meta.height, meta.orientation]).toEqual([
        200,
        400,
        undefined,
      ]);
      await surveyor
        .delete(`/api/cameras/${cameraId}/photos/${res.body.id}`)
        .expect(204);
    });

    it('PATCH changes only type and caption', async () => {
      const res = await upload(
        engineer,
        cameraId,
        await image(300, 200),
      ).expect(201);
      expect(res.body.photoType).toBe('other');
      expect(res.body.caption).toBeUndefined();
      const url = `/api/cameras/${cameraId}/photos/${res.body.id}`;

      const p1 = await surveyor
        .patch(url)
        .send({ photoType: 'cable_route', caption: 'แนวสายใต้ดิน' })
        .expect(200);
      expect(p1.body).toMatchObject({
        id: res.body.id,
        photoType: 'cable_route',
        caption: 'แนวสายใต้ดิน',
        fileSize: res.body.fileSize,
        width: 300,
        height: 200,
      });
      const p2 = await surveyor.patch(url).send({ caption: null }).expect(200);
      expect(p2.body.caption).toBeUndefined();
      expect(p2.body.photoType).toBe('cable_route');

      for (const bad of [
        {},
        { photoType: 'selfie' },
        { caption: 'x'.repeat(501) },
        { fileKey: '../../etc/passwd' },
        { width: 1 },
      ]) {
        await surveyor.patch(url).send(bad).expect(400);
      }
      await viewer.patch(url).send({ caption: 'no' }).expect(403);
      // Another camera's id with this photo: not found.
      await surveyor
        .patch(`/api/cameras/${otherCameraId}/photos/${res.body.id}`)
        .send({ caption: 'x' })
        .expect(404);
    });

    it('a photo is only reachable through its own camera', async () => {
      const res = await upload(surveyor, cameraId, await image(64, 64)).expect(
        201,
      );
      const other = `/api/cameras/${otherCameraId}/photos/${res.body.id}`;
      await viewer.get(`${other}/file`).expect(404);
      await viewer.get(`${other}/file?size=thumb`).expect(404);
      await surveyor.delete(other).expect(404);
      const list = await viewer
        .get(`/api/cameras/${otherCameraId}/photos`)
        .expect(200);
      expect(list.body).toEqual([]);
      await viewer.get(res.body.url).expect(200);
    });

    it('DELETE removes the row and both files', async () => {
      const res = await upload(surveyor, cameraId, await image(100, 80)).expect(
        201,
      );
      const file = await fileOf(res.body.id, 'file_key');
      const thumb = await fileOf(res.body.id, 'thumb_key');
      expect(existsSync(file) && existsSync(thumb)).toBe(true);
      const url = `/api/cameras/${cameraId}/photos/${res.body.id}`;
      await viewer.delete(url).expect(403);
      await surveyor.delete(url).expect(204);
      expect(existsSync(file) || existsSync(thumb)).toBe(false);
      await viewer.get(`${url}/file`).expect(404);
      await surveyor.delete(url).expect(404);
    });

    it('drops anything but the pixels (metadata, appended bytes)', async () => {
      const jpeg = await sharp(await image(400, 300))
        .withMetadata({ exif: { IFD0: { Copyright: 'SECRET-EXIF' } } })
        .jpeg()
        .toBuffer();
      const polyglot = Buffer.concat([
        jpeg,
        Buffer.from('<script>alert(1)</script>'),
      ]);
      const res = await upload(engineer, cameraId, polyglot).expect(201);
      const file = await download(viewer, res.body.url).expect(200);
      const bytes = (file.body as Buffer).toString('latin1');
      expect(bytes).not.toContain('<script>');
      expect(bytes).not.toContain('SECRET-EXIF');
    });

    it('validates type, content, size and query', async () => {
      // Declared image, but not one: 400. Other types: 415.
      await upload(
        surveyor,
        cameraId,
        Buffer.from('not an image at all'),
      ).expect(400);
      // Real GIF bytes declared as JPEG: decoded, not jpeg/png/webp → 400.
      const gif = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64',
      );
      await upload(surveyor, cameraId, gif).expect(400);
      await upload(surveyor, cameraId, gif, 'image/gif').expect(415);
      await upload(surveyor, cameraId, Buffer.from('x'), 'text/plain').expect(
        415,
      );
      await upload(
        surveyor,
        cameraId,
        Buffer.from('<svg/>'),
        'image/svg+xml',
      ).expect(415);
      await upload(
        surveyor,
        cameraId,
        Buffer.from('x'),
        'application/json',
      ).expect(415);
      await surveyor
        .post(`/api/cameras/${cameraId}/photos`)
        .set('Content-Type', 'image/jpeg')
        .expect(400);
      await upload(
        surveyor,
        cameraId,
        Buffer.alloc(PHOTO_MAX_BYTES + 1, 1),
      ).expect(413);
      await upload(
        surveyor,
        cameraId,
        await image(10, 10),
        'image/jpeg',
        '?type=selfie',
      ).expect(400);
      await upload(
        surveyor,
        cameraId,
        await image(10, 10),
        'image/jpeg',
        `?caption=${'x'.repeat(501)}`,
      ).expect(400);
      await upload(surveyor, missing, await image(10, 10)).expect(404);
      // The image exception is only for this route: JSON stays mandatory elsewhere.
      await surveyor
        .post('/api/cameras')
        .set('Content-Type', 'image/jpeg')
        .send(await image(10, 10))
        .expect(415);
      await surveyor
        .patch(`/api/cameras/${cameraId}/photos/${missing}`)
        .set('Content-Type', 'image/jpeg')
        .send(await image(10, 10))
        .expect(415);
    });

    it('rejects path traversal everywhere', async () => {
      const http = request(app.getHttpServer());
      for (const path of [
        `/api/cameras/${cameraId}/photos/..%2F..%2F..%2Fetc%2Fpasswd/file`,
        `/api/cameras/${cameraId}/photos/%2e%2e/file`,
        `/api/cameras/..%2F..%2Fetc/photos/${missing}/file`,
        `/api/cameras/${cameraId}/photos/not-a-uuid/file`,
      ]) {
        const res = await viewer.get(path);
        expect([400, 404], path).toContain(res.status);
        expect(res.headers['content-type'], path).toMatch(/json/);
      }
      // Normalised by the HTTP stack before routing: never a file.
      const raw = await http.get(
        `/api/cameras/${cameraId}/photos/../../../../etc/passwd`,
      );
      expect([401, 404]).toContain(raw.status);
      // The storage layer refuses any key but its own shape.
      const storage = app.get(PhotoStorage);
      for (const key of [
        '../etc/passwd',
        'photos/../../etc/passwd',
        '/etc/passwd',
        'photos/2026/10/x.jpg',
        'photos/2026/10/00000000-0000-4000-8000-000000000000.png',
      ]) {
        expect(() => storage.resolve(key), key).toThrow();
      }
      // …and so does the database (0006 CHECK).
      const db = app.get(Database);
      await expect(
        db
          .insertInto('camera_photos')
          .values({
            camera_point_id: cameraId,
            file_key: 'photos/../../etc/passwd',
            thumb_key:
              'photos/2026/10/00000000-0000-4000-8000-000000000000_t.jpg',
            content_type: 'image/jpeg',
            size_bytes: 1,
            width: 1,
            height: 1,
          })
          .execute(),
      ).rejects.toThrow(/camera_photos_file_key_check/);
    });

    it('requires a session', async () => {
      const anon = request(app.getHttpServer());
      const base = `/api/cameras/${cameraId}/photos`;
      await anon
        .post(base)
        .set('Content-Type', 'image/jpeg')
        .send(await image(10, 10))
        .expect(401);
      await anon.get(base).expect(401);
      await anon.get(`${base}/${missing}/file`).expect(401);
      await anon.patch(`${base}/${missing}`).send({ caption: 'x' }).expect(401);
      await anon.delete(`${base}/${missing}`).expect(401);
    });

    it('deleting the camera point deletes its photos and files', async () => {
      const cam = await newCamera(surveyor, {
        label: 'CCTV-DEL',
        type: 'dome',
      }).expect(201);
      const p1 = await upload(
        surveyor,
        cam.body.id,
        await image(50, 50),
      ).expect(201);
      const p2 = await upload(
        surveyor,
        cam.body.id,
        await image(60, 60),
      ).expect(201);
      const files = [];
      for (const p of [p1, p2]) {
        files.push(
          await fileOf(p.body.id, 'file_key'),
          await fileOf(p.body.id, 'thumb_key'),
        );
      }
      expect(files.every((f) => existsSync(f))).toBe(true);

      await surveyor.delete(`/api/cameras/${cam.body.id}`).expect(204);
      expect(files.some((f) => existsSync(f))).toBe(false);
      await viewer.get(p1.body.url).expect(404);
      expect(
        readdirSync(path.dirname(files[0])).filter((f) => f.endsWith('.tmp')),
      ).toEqual([]);
    });
  });
});
