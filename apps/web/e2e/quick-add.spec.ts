import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import {
  adminApi,
  MODELS,
  pickCamera,
  PREFIX,
  seedProject,
  storage,
} from './env';

/**
 * Camera form (six sections: code, GPS, camera model, photos, …);
 * camera model master data; photos. Desktop browser — the phone layout is in
 * mobile.spec.ts.
 */

/** A real PNG drawn by the browser (so the app can decode and shrink it). */
async function makeImage(page: Page, w: number, h: number, color: string) {
  const b64 = await page.evaluate(
    ([w, h, color]) => {
      const c = document.createElement('canvas');
      c.width = Number(w);
      c.height = Number(h);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = String(color);
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#fff';
      ctx.fillRect(10, 10, c.width / 3, c.height / 3);
      return c.toDataURL('image/png').split(',')[1];
    },
    [w, h, color] as const,
  );
  return {
    name: `photo-${color.slice(1)}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from(b64, 'base64'),
  };
}

/** Every thumbnail in the gallery has really loaded from the API. */
async function expectThumbsLoaded(page: Page, n: number) {
  const imgs = page.getByRole('list', { name: 'รูปหน้างาน' }).locator('img');
  await expect(imgs).toHaveCount(n);
  for (const img of await imgs.all()) {
    await expect
      .poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth))
      .toBeGreaterThan(0);
  }
}

let api: APIRequestContext;
let seeded: Awaited<ReturnType<typeof seedProject>>;

test.beforeAll(async () => {
  api = await adminApi();
  seeded = await seedProject(api, 'quick add');
});

test.afterAll(async () => {
  await api.dispose();
});

test.describe('camera model master (admin)', () => {
  test.use({ storageState: storage.admin });

  test('1) admin adds a model, edits it, switches it off and on', async ({
    page,
  }) => {
    const brand = `${PREFIX} Uniview`;
    // Main menu "กล้อง" → ข้อมูลกล้อง (admin only).
    await page.goto('/projects');
    await page
      .getByRole('navigation', { name: 'เมนูหลัก' })
      .getByRole('link', { name: 'กล้อง' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'ข้อมูลกล้อง' }),
    ).toBeVisible();

    await page.getByRole('button', { name: '+ เพิ่มรุ่นกล้อง' }).click();
    // Field order: ยี่ห้อ → รุ่น → MP → ประเภท
    expect(
      await page
        .locator('#cm-brand, #cm-model, #cm-mp, #cm-type')
        .evaluateAll((els) => els.map((e) => e.id)),
    ).toEqual(['cm-brand', 'cm-model', 'cm-mp', 'cm-type']);
    await page.locator('#cm-brand').fill(brand);
    await page.locator('#cm-model').fill('IPC322LB');
    await page.getByLabel('ประเภท').selectOption('bullet');
    await page.getByLabel('MP').fill('2');
    await page.getByRole('button', { name: 'บันทึก' }).click();

    const list = page.getByRole('list', { name: 'รายการรุ่นกล้อง' });
    const row = list.getByRole('listitem').filter({ hasText: 'IPC322LB' });
    await expect(row).toContainText(`${brand} · IPC322LB`);
    await expect(row).toContainText('2 MP · Bullet · ใช้อยู่ 0 จุด');
    await expect(row).toContainText('ใช้งาน');

    // Same brand + model again (other case): refused
    await page.getByRole('button', { name: '+ เพิ่มรุ่นกล้อง' }).click();
    await page.locator('#cm-brand').fill(brand.toUpperCase());
    await page.locator('#cm-model').fill('ipc322lb');
    await page.getByLabel('ประเภท').selectOption('bullet');
    await page.getByRole('button', { name: 'บันทึก' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'มีรุ่นกล้องนี้ในรายการแล้ว',
    );
    await page.getByRole('button', { name: 'ยกเลิก' }).click();

    await row.getByRole('button', { name: 'แก้ไข' }).click();
    await page.getByLabel('MP').fill('4');
    await page.getByRole('button', { name: 'บันทึก' }).click();
    await expect(row).toContainText('4 MP · Bullet');

    await row.getByRole('button', { name: /ปิดใช้งาน/ }).click();
    await expect(row).toContainText('ปิดใช้งาน');
    await row.getByRole('button', { name: /เปิดใช้งาน/ }).click();
    await expect(row.getByRole('button', { name: /ปิดใช้งาน/ })).toBeVisible();
  });
});

test.describe('camera model master — not for surveyors', () => {
  test.use({ storageState: storage.surveyor });

  test('surveyor: no menu entry, page says no permission', async ({ page }) => {
    await page.goto('/projects');
    await page.getByRole('button', { name: /เมนูผู้ใช้/ }).click();
    await expect(page.getByRole('link', { name: /ข้อมูลกล้อง/ })).toHaveCount(
      0,
    );
    // The main menu item stays disabled for surveyors.
    await expect(
      page
        .getByRole('navigation', { name: 'เมนูหลัก' })
        .getByRole('link', { name: 'กล้อง' }),
    ).toHaveCount(0);
    await page.goto('/camera-models');
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'คุณไม่มีสิทธิ์เข้าถึงหน้านี้',
    );
  });
});

test.describe('camera form (surveyor)', () => {
  test.use({ storageState: storage.surveyor });

  test('1–9) sections, brand → model, auto MP/type, photos with type, save', async ({
    page,
  }) => {
    await page.goto(`/projects/${seeded.project.id}/cameras/new`);
    const main = page.getByRole('main');

    // Six numbered section cards, always open (no accordion).
    await expect(page.getByRole('heading', { name: 'สถานะ' })).toBeVisible();
    const sections = await page
      .getByRole('main')
      .locator('form section > div h2')
      .allTextContents();
    expect(sections).toEqual([
      'ตำแหน่ง',
      'กล้อง',
      'จุดติดตั้ง',
      'ระบบ',
      'รูปหน้างาน',
      'สถานะ',
    ]);
    await expect(page.locator('details')).toHaveCount(0);
    await expect(page.getByLabel('รหัสกล้อง')).toHaveValue('CCTV-001');
    await expect(page.getByLabel('วันที่/เวลา')).not.toHaveValue('');
    await expect(page.locator('#status')).toHaveValue('surveyed');

    // 2) Model list follows the brand
    const brand = page.getByLabel('ยี่ห้อ', { exact: true });
    const model = page.getByLabel('รุ่น', { exact: true });
    await expect(model).toBeDisabled();
    await brand.selectOption(MODELS.hikDome.brand);
    const options = await model.locator('option').allTextContents();
    expect(options).toEqual([
      'เลือกรุ่น',
      ...[MODELS.hikTurret.model, MODELS.hikDome.model].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase()),
      ),
      'ไม่มีในรายการ (ระบุเอง)',
    ]);
    expect(options).not.toContain(MODELS.dahuaBullet.model);

    // 3) Model → type + MP, shown and not typed
    await model.selectOption({ label: MODELS.hikDome.model });
    const spec = page.getByTestId('camera-spec');
    await expect(spec).toHaveText('5 MP · Dome');
    // Nothing to type again: no brand / model / MP / type inputs.
    for (const id of ['#brand', '#model', '#type', '#resolutionMp']) {
      await expect(page.locator(id)).toHaveCount(0);
    }
    // Another model of the brand: MP and type follow.
    await page
      .getByLabel('รุ่น', { exact: true })
      .selectOption({ label: MODELS.hikTurret.model });
    await expect(spec).toHaveText('4 MP · Turret');
    // A brand with one model picks it straight away.
    await brand.selectOption(MODELS.dahuaBullet.brand);
    await expect(model).toHaveValue(/.+/);
    await expect(spec).toHaveText('8 MP · Bullet');
    await pickCamera(main, MODELS.hikDome);

    // GPS position
    await page.getByLabel('ละติจูด (lat)').fill('15.1234567');
    await page.getByLabel('ลองจิจูด (lng)').fill('100.7654321');
    await page.getByLabel('GPS Accuracy (±ม.)').fill('2');

    // Photos before saving: thumbnails, preview, type + caption, remove
    await page
      .getByLabel('+ เพิ่มรูป')
      .setInputFiles([
        await makeImage(page, 1600, 1200, '#2563eb'),
        await makeImage(page, 800, 600, '#16a34a'),
        await makeImage(page, 640, 480, '#dc2626'),
      ]);
    const pending = page.getByRole('list', { name: 'รูปที่จะบันทึก' });
    await expect(pending.locator('img')).toHaveCount(3);
    await pending.getByRole('button', { name: 'ลบรูปที่ 2' }).click();
    await expect(pending.locator('img')).toHaveCount(2);
    // Preview the second photo, set its type and a caption.
    await pending.getByRole('button', { name: /ดูรูปที่ 2/ }).click();
    const editor = page.getByRole('dialog', { name: 'รูปหน้างาน' });
    await expect(editor.getByRole('img', { name: 'รูปหน้างาน' })).toBeVisible();
    await editor.getByLabel('ประเภทรูป').selectOption('pole_structure');
    await editor.getByLabel('คำอธิบาย (ไม่บังคับ)').fill('เสาไฟเดิม');
    await editor.getByRole('button', { name: 'บันทึกรูป' }).click();
    await expect(editor).toBeHidden();
    await expect(pending.getByRole('listitem').nth(1)).toContainText(
      'เสา/โครงสร้าง',
    );
    await expect(pending.getByRole('listitem').nth(0)).toContainText(
      'จุดติดตั้ง',
    );

    const uploads: { status: number; url: string }[] = [];
    page.on('response', (r) => {
      if (r.request().method() === 'POST' && r.url().includes('/photos')) {
        uploads.push({ status: r.status(), url: r.url() });
      }
    });
    const created = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' && r.url().endsWith('/api/cameras'),
    );
    await page.getByRole('button', { name: 'บันทึก' }).click();
    const res = await created;
    expect(res.status()).toBe(201);
    // 4) Only Quick Add data was sent
    const body = res.request().postDataJSON();
    expect(body).toMatchObject({
      label: 'CCTV-001',
      cameraModelId: expect.any(String),
      location: { lat: 15.1234567, lng: 100.7654321 },
      gpsAccuracyM: 2,
    });
    // Model chosen: the server fills brand / model / type / MP. Untouched
    // optional fields are not sent at all.
    for (const k of [
      'type',
      'brand',
      'model',
      'resolutionMp',
      'bearingDeg',
      'poe',
      'notes',
    ]) {
      expect(body[k], k).toBeUndefined();
    }
    expect(body.status).toBe('surveyed');
    expect(body.surveyedAt).toEqual(expect.any(String));

    // 7) Camera detail
    await expect(page.getByRole('heading', { name: 'CCTV-001' })).toBeVisible();
    const detail = page.getByTestId('camera-detail');
    await expect(detail).toContainText('สำรวจแล้ว');
    await expect(detail).toContainText('15.123457, 100.765432');
    await expect(detail).toContainText('GPS Accuracy ±2 m');
    await expect(detail).toContainText(MODELS.hikDome.brand);
    await expect(detail).toContainText(MODELS.hikDome.model);
    await expect(detail).toContainText('Dome · 5 MP');
    await expect(detail).toContainText('รูปหน้างาน (2)');
    await expectThumbsLoaded(page, 2);
    expect(uploads.map((u) => u.status)).toEqual([201, 201]);
    expect(uploads[0].url).toContain('type=installation_point');
    expect(decodeURIComponent(uploads[1].url)).toContain(
      'type=pole_structure&caption=เสาไฟเดิม',
    );
    await expect(
      detail.getByRole('button', { name: /ดูรูปที่ 2: เสา\/โครงสร้าง/ }),
    ).toBeVisible();
    await expect(
      detail.getByRole('link', { name: 'รายละเอียด Survey (1/15)' }),
    ).toBeVisible();

    const id = /\/cameras\/([^/?]+)/.exec(page.url())![1];
    const stored = await (await api.get(`/api/cameras/${id}`)).json();
    expect(stored).toMatchObject({
      type: 'dome',
      resolutionMp: 5,
      status: 'surveyed',
      photoCount: 2,
    });
    expect(stored.surveyedAt).toBeDefined();
    expect(stored.bearingDeg).toBeUndefined();

    // Full-size viewer
    await detail.getByRole('button', { name: /ดูรูปที่ 1/ }).click();
    const viewer = page.getByRole('dialog', { name: 'รูปหน้างาน' });
    const full = viewer.getByRole('img', { name: 'รูปหน้างาน' });
    await expect
      .poll(() => full.evaluate((e: HTMLImageElement) => e.naturalWidth))
      .toBe(1600);
    await viewer.getByRole('button', { name: 'ปิด' }).click();
  });

  test('save with only code, position and camera; photos later: type, delete; edit', async ({
    page,
  }) => {
    await page.goto(`/projects/${seeded.project.id}/cameras/new`);
    await page.getByLabel('รหัสกล้อง').fill('CCTV-LATER');
    await page.getByLabel('ละติจูด (lat)').fill('15.2');
    await page.getByLabel('ลองจิจูด (lng)').fill('100.2');
    await pickCamera(page.getByRole('main'), MODELS.dahuaBullet);
    await page.getByRole('button', { name: 'บันทึก' }).click();
    const detail = page.getByTestId('camera-detail');
    await expect(detail).toContainText('รูปหน้างาน (0)');
    await expect(detail).toContainText('Bullet · 8 MP');

    // 6) Add photos to the saved point
    await detail
      .getByLabel('เพิ่มรูป')
      .setInputFiles([await makeImage(page, 1200, 900, '#9333ea')]);
    await expect(detail).toContainText('รูปหน้างาน (1)');
    await expectThumbsLoaded(page, 1);
    await detail
      .getByLabel('เพิ่มรูป')
      .setInputFiles([await makeImage(page, 900, 1200, '#ea580c')]);
    await expect(detail).toContainText('รูปหน้างาน (2)');
    await expectThumbsLoaded(page, 2);

    // Change a saved photo's type (PATCH), then delete another one.
    await detail.getByRole('button', { name: /ดูรูปที่ 1/ }).click();
    const viewer = page.getByRole('dialog', { name: 'รูปหน้างาน' });
    await viewer.getByLabel('ประเภทรูป').selectOption('cable_route');
    const patchPhoto = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.url().includes('/photos/'),
    );
    await viewer.getByRole('button', { name: 'บันทึกรูป' }).click();
    expect((await patchPhoto).request().postDataJSON()).toEqual({
      photoType: 'cable_route',
    });
    await expect(
      detail.getByRole('button', { name: /ดูรูปที่ 1: แนวเดินสาย/ }),
    ).toBeVisible();
    await detail.getByRole('button', { name: /ดูรูปที่ 2/ }).click();
    await viewer.getByRole('button', { name: 'ลบรูปนี้' }).click();
    await page
      .getByRole('dialog', { name: 'ลบรูปนี้?' })
      .getByRole('button', { name: 'ยืนยันการลบ' })
      .click();
    await expect(detail).toContainText('รูปหน้างาน (1)');

    // 10) Edit the saved camera: the same form as for a new one.
    await detail.getByRole('link', { name: 'แก้ไขข้อมูลกล้อง' }).click();
    await expect(page).toHaveURL(/\/edit$/);
    await expect(page.getByLabel('รหัสกล้อง')).toHaveValue('CCTV-LATER');
    await expect(page.getByTestId('camera-spec')).toHaveText('8 MP · Bullet');
    await expect(
      page
        .getByRole('list', { name: 'รูปหน้างานที่บันทึกแล้ว' })
        .locator('img'),
    ).toHaveCount(1);
    await page.getByLabel('ความสูงติดตั้ง (ม.)').fill('4.5');
    await page.getByLabel('Lens (มม.)').fill('2.8');
    await page.getByLabel('เครือข่าย').selectOption('true');
    await page.getByLabel('หมายเหตุ (ไม่บังคับ)').fill('ติดใต้ชายคา');
    const patch = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && !r.url().includes('/photos/'),
    );
    await page.getByRole('button', { name: 'บันทึก' }).click();
    expect((await patch).request().postDataJSON()).toEqual({
      mountHeightM: 4.5,
      lensMm: 2.8,
      networkAvailable: true,
      notes: 'ติดใต้ชายคา',
    });
    // Height, notes and status count; Network alone (no Fiber answer) not yet.
    await expect(
      detail.getByRole('link', { name: 'รายละเอียด Survey (3/15)' }),
    ).toBeVisible();
    await expect(detail).toContainText('Bullet · 8 MP');
  });
});

test.describe('inactive camera models', () => {
  test.use({ storageState: storage.surveyor });

  test('8) not offered for new points; 9) existing points still show them', async ({
    page,
  }) => {
    const brand = `${PREFIX} Retired`;
    const m = await (
      await api.post('/api/camera-models', {
        data: { brand, model: 'OLD-5MP', cameraType: 'dome', resolutionMp: 5 },
      })
    ).json();
    const cam = await (
      await api.post('/api/cameras', {
        data: {
          projectId: seeded.project.id,
          label: 'CCTV-OLD',
          cameraModelId: m.id,
          location: { lat: 15.3, lng: 100.3 },
          gpsAccuracyM: 3,
        },
      })
    ).json();
    const before = await (await api.get(`/api/cameras/${cam.id}`)).json();
    const off = await api.patch(`/api/camera-models/${m.id}`, {
      data: { active: false },
    });
    expect(off.status()).toBe(200);

    // 8) Not in the brand / model lists for a new point
    await page.goto(`/projects/${seeded.project.id}/cameras/new`);
    const brandSelect = page.getByLabel('ยี่ห้อ', { exact: true });
    await expect(brandSelect).toBeVisible();
    const brandOptions = await brandSelect.locator('option').allTextContents();
    expect(brandOptions).toContain(MODELS.hikDome.brand);
    expect(brandOptions).not.toContain(brand);

    // 9) The existing point shows its camera as before
    await page.goto(`/cameras/${cam.id}`);
    const detail = page.getByTestId('camera-detail');
    await expect(detail).toContainText(brand);
    await expect(detail).toContainText('OLD-5MP');
    await expect(detail).toContainText('Dome · 5 MP');
    await expect(detail).toContainText('GPS Accuracy ±3 m');
    await expect(detail).toContainText('รุ่นนี้ปิดใช้งานในรายการแล้ว');

    // …and its edit form keeps the model (marked), saving changes nothing
    await detail.getByRole('link', { name: 'แก้ไขข้อมูลกล้อง' }).click();
    await expect(page.getByLabel('ยี่ห้อ', { exact: true })).toHaveValue(brand);
    await expect(
      page.getByLabel('รุ่น', { exact: true }).locator('option:checked'),
    ).toHaveText('OLD-5MP (ปิดใช้งานแล้ว)');
    let patched = false;
    page.on('request', (r) => {
      if (r.method() === 'PATCH') patched = true;
    });
    await page.getByRole('button', { name: 'บันทึก' }).click();
    await expect(page).toHaveURL(new RegExp(`/cameras/${cam.id}$`));
    expect(patched).toBe(false);

    const after = await (await api.get(`/api/cameras/${cam.id}`)).json();
    // Only the master's state differs; the point's own data is unchanged.
    expect(after).toEqual({
      ...before,
      cameraModelActive: false,
      cameraModel: { ...before.cameraModel, active: false },
    });
    // The project list still shows it too.
    await page.goto(`/projects/${seeded.project.id}`);
    await page.getByRole('tab', { name: 'กล้อง' }).click();
    await expect(page.getByRole('list', { name: 'รายการกล้อง' })).toContainText(
      'OLD-5MP',
    );
  });
});
