import { expect, test, type Page } from '@playwright/test';
import { adminApi, projectList, seedProject, storage } from './env';
import { googleMarker, stubGoogleMaps, tapGoogleMap } from './google-maps-stub';

/** Runs on the emulated phones (Pixel 7, iPhone 13 — Chromium). */

let seeded: Awaited<ReturnType<typeof seedProject>>;

test.beforeAll(async ({}, info) => {
  const api = await adminApi();
  // Runs once per device project, so the name must be unique per device.
  seeded = await seedProject(
    api,
    `${info.project.name} ชื่อโครงการยาวมากเพื่อทดสอบการตัดบรรทัดบนหน้าจอขนาดเล็ก`,
  );
  await api.dispose();
});

async function expectNoHorizontalScroll(page: Page) {
  const { scroll, viewport } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(scroll, 'page is wider than the screen').toBeLessThanOrEqual(viewport);
}

test('login page fits the screen', async ({ page }, info) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await info.attach('login', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test.describe('signed in', () => {
  test.use({ storageState: storage.admin });

  test('list, detail and forms fit the screen', async ({ page }, info) => {
    await page.goto('/projects');
    await expect(
      projectList(page).getByText(seeded.project.name),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
    await info.attach('projects', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    await projectList(page).getByText(seeded.project.name).tap();
    await expect(
      page.getByRole('heading', { name: seeded.project.name }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
    await info.attach('project-detail', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    await page.getByRole('link', { name: 'แก้ไข', exact: true }).tap();
    await expect(page.getByLabel('ชื่อ / รหัสกล้อง')).toHaveValue('CAM-01');
    await expectNoHorizontalScroll(page);
    await info.attach('camera-form', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });

  test('buttons are large enough to tap (≥ 44px high)', async ({ page }) => {
    await page.goto(`/projects/${seeded.project.id}`);
    await expect(
      page.getByRole('heading', { name: seeded.project.name }),
    ).toBeVisible();
    for (const el of await page.getByRole('button').all()) {
      if (!(await el.isVisible())) continue;
      const box = await el.boundingBox();
      expect(box!.height, await el.innerText()).toBeGreaterThanOrEqual(44);
    }
  });

  test('user menu opens and works on touch', async ({ page }) => {
    await page.goto('/projects');
    await page.getByTestId('current-user').tap();
    await expect(
      page.getByRole('link', { name: 'เปลี่ยนรหัสผ่าน' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'ออกจากระบบ' }),
    ).toBeVisible();
  });

  test('FAB sits above the bottom navigation; sheet options are easy to tap', async ({
    page,
  }) => {
    await page.goto('/design-system');
    const fab = page.getByRole('button', { name: 'เพิ่มจุด' });
    const nav = page.getByRole('navigation', { name: 'เมนูหลัก (มือถือ)' });
    const fabBox = (await fab.boundingBox())!;
    const navBox = (await nav.boundingBox())!;
    expect(fabBox.height).toBeGreaterThanOrEqual(56);
    expect(fabBox.y + fabBox.height).toBeLessThanOrEqual(navBox.y);

    await fab.tap();
    const sheet = page.getByRole('dialog', { name: 'เพิ่มจุดติดตั้ง CCTV' });
    await expect(sheet).toBeVisible();
    // Anchored to the bottom of the screen on phones.
    const sheetBox = (await sheet.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(Math.round(sheetBox.y + sheetBox.height)).toBeGreaterThanOrEqual(
      viewport.height - 1,
    );
    for (const name of ['ใช้ตำแหน่งปัจจุบัน', 'เลือกตำแหน่งบนแผนที่']) {
      const box = (await sheet
        .getByRole('button', { name: new RegExp(name) })
        .boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(64);
    }
    await sheet.getByRole('button', { name: 'ยกเลิก' }).tap();
    await expect(sheet).toBeHidden();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('survey map — Google Maps (stubbed), GPS ±5 m', () => {
  test.use({
    storageState: storage.admin,
    permissions: ['geolocation'],
    geolocation: { latitude: 13.7401, longitude: 100.5602, accuracy: 5 },
  });

  test('markers, one-tap GPS add, tap-to-pick add, reload, marker detail', async ({
    page,
  }) => {
    await stubGoogleMaps(page);
    await page.goto(`/projects/${seeded.project.id}/map`);

    // Google map, created once with the Map ID; no GPS request on open.
    await expect(page.locator('[data-map-engine="google"]')).toBeVisible();
    await expect(googleMarker(page, 'CAM-01')).toBeVisible();
    const gm = await page.evaluate(() => {
      const g = (
        window as unknown as {
          __gmap: {
            loads: number;
            requests: string[];
            map: { opts: Record<string, unknown> };
          };
        }
      ).__gmap;
      return { loads: g.loads, src: g.requests[0], opts: g.map.opts };
    });
    expect(gm.loads).toBe(1);
    expect(gm.src).toContain('key=e2e-dummy-key');
    expect(gm.opts.mapId).toBe('e2e-map-id');
    expect(gm.opts.gestureHandling).toBe('greedy');
    await expect(page.getByTestId('gps-status')).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    const fab = page.getByRole('button', { name: 'เพิ่มจุดติดตั้ง' });
    const nav = page.getByRole('navigation', { name: 'เมนูแผนที่' });
    expect(
      (await fab.boundingBox())!.y + (await fab.boundingBox())!.height,
    ).toBeLessThanOrEqual((await nav.boundingBox())!.y);

    // 1) One tap on "use current position" goes straight to the form.
    await fab.tap();
    const add = page.getByRole('dialog', { name: 'เพิ่มจุดติดตั้ง CCTV' });
    await add.getByRole('button', { name: /ใช้ตำแหน่งปัจจุบัน/ }).tap();
    const form = page.getByRole('dialog', { name: 'จุดกล้องใหม่' });
    await expect(form).toContainText('จาก GPS');
    await expect(form.getByLabel('ชื่อ / รหัสกล้อง')).toHaveValue('CCTV-001');
    await expect(form.getByLabel('ละติจูด (lat)')).toHaveValue('13.7401');
    await expect(form.getByLabel('ลองจิจูด (lng)')).toHaveValue('100.5602');
    await expect(form.getByLabel('ความแม่นยำ GPS (ม.)')).toHaveValue('5');
    await form.getByRole('button', { name: 'บันทึก' }).tap();
    await expect(page.getByText('✓ บันทึก CCTV-001 สำเร็จ')).toBeVisible();
    await expect(form).toBeHidden();
    await expect(googleMarker(page, 'CCTV-001')).toBeVisible();

    // 2) Pick on the map: tap → temporary marker → choose again → confirm.
    await fab.tap();
    await add.getByRole('button', { name: /เลือกตำแหน่งบนแผนที่/ }).tap();
    await expect(
      page.getByText('แตะตำแหน่งที่ต้องการติดตั้งกล้อง'),
    ).toBeVisible();
    await expect(page.getByTestId('picked-marker')).toHaveCount(0);
    await tapGoogleMap(page, 13.7412345, 100.5612345);
    await expect(page.getByTestId('picked-marker')).toBeVisible();
    await expect(page.getByTestId('pick-coords')).toContainText('13.74123450');
    await page.getByRole('button', { name: 'เลือกใหม่' }).tap();
    await expect(page.getByTestId('picked-marker')).toHaveCount(0);
    await tapGoogleMap(page, 13.75, 100.57);
    await expect(page.getByTestId('pick-coords')).toContainText('100.57000000');
    await page.getByRole('button', { name: 'ยืนยันตำแหน่ง' }).tap();
    await expect(form).toContainText('เลือกบนแผนที่');
    await expect(form.getByLabel('ชื่อ / รหัสกล้อง')).toHaveValue('CCTV-002');
    await expect(form.getByLabel('ละติจูด (lat)')).toHaveValue('13.75');
    // A picked point has no GPS accuracy.
    await expect(form.getByLabel('ความแม่นยำ GPS (ม.)')).toHaveValue('');
    await form.getByRole('button', { name: 'บันทึก' }).tap();
    await expect(page.getByText('✓ บันทึก CCTV-002 สำเร็จ')).toBeVisible();
    await expect(googleMarker(page, 'CCTV-002')).toBeVisible();

    // In normal mode a tap on the map creates nothing.
    await tapGoogleMap(page, 13.76, 100.58);
    await expect(page.getByTestId('picked-marker')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Stored through the existing camera API. There is no location_source
    // field: a GPS point keeps its accuracy, a map-picked point has none.
    const api = await adminApi();
    const stored = (await (
      await api.get(`/api/projects/${seeded.project.id}/cameras`)
    ).json()) as {
      label: string;
      location: { lat: number; lng: number };
      gpsAccuracyM?: number;
    }[];
    await api.dispose();
    const gpsPoint = stored.find((c) => c.label === 'CCTV-001');
    const mapPoint = stored.find((c) => c.label === 'CCTV-002');
    expect(gpsPoint?.gpsAccuracyM).toBe(5);
    expect(mapPoint?.location).toEqual({ lat: 13.75, lng: 100.57 });
    expect(mapPoint?.gpsAccuracyM ?? null).toBeNull();

    // 3) Reload: the points come back from the existing camera API.
    await page.reload();
    await expect(googleMarker(page, 'CCTV-001')).toBeVisible();
    await expect(googleMarker(page, 'CCTV-002')).toBeVisible();

    // 4) Marker detail with edit and navigation.
    await googleMarker(page, 'CCTV-001').tap();
    const detail = page.getByRole('dialog', { name: 'CCTV-001' });
    await expect(detail).toContainText('สำรวจแล้ว');
    await expect(detail).toContainText('13.740100');
    await expect(detail).toContainText('±5 ม.');
    await expect(detail.getByRole('link', { name: 'แก้ไข' })).toHaveAttribute(
      'href',
      /\/cameras\/.+\/edit$/,
    );
    await expect(detail.getByRole('link', { name: 'นำทาง' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=13.7401,100.5602',
    );
    await expectNoHorizontalScroll(page);
  });

  test('weak GPS shows a warning but still allows saving', async ({
    page,
    context,
  }) => {
    await context.setGeolocation({
      latitude: 13.7402,
      longitude: 100.5603,
      accuracy: 45,
    });
    await stubGoogleMaps(page);
    await page.goto(`/projects/${seeded.project.id}/map`);
    await page.getByRole('button', { name: 'เพิ่มจุดติดตั้ง' }).tap();
    await page
      .getByRole('dialog', { name: 'เพิ่มจุดติดตั้ง CCTV' })
      .getByRole('button', { name: /ใช้ตำแหน่งปัจจุบัน/ })
      .tap();
    const form = page.getByRole('dialog', { name: 'จุดกล้องใหม่' });
    await expect(form).toContainText('ยังบันทึกได้');
    await expect(page.getByTestId('gps-status')).toContainText('GPS อ่อน');
    await form.getByLabel('ชื่อ / รหัสกล้อง').fill('WEAK-01');
    await form.getByRole('button', { name: 'บันทึก' }).tap();
    await expect(page.getByText('✓ บันทึก WEAK-01 สำเร็จ')).toBeVisible();
  });
});

test.describe('survey map — GPS not allowed', () => {
  test.use({ storageState: storage.admin, permissions: [] });

  test('GPS failure does not crash and offers the map picker', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await stubGoogleMaps(page);
    await page.goto(`/projects/${seeded.project.id}/map`);
    await expect(googleMarker(page, 'CAM-01')).toBeVisible();

    // ◎ with GPS refused: a message, the map stays.
    await page.getByRole('button', { name: 'ไปยังตำแหน่งปัจจุบัน' }).tap();
    await expect(
      page.getByText(/ไม่สามารถรับตำแหน่งปัจจุบันได้/),
    ).toBeVisible();
    await expect(page.locator('[data-map-engine="google"]')).toBeVisible();

    await page.getByRole('button', { name: 'เพิ่มจุดติดตั้ง' }).tap();
    const add = page.getByRole('dialog', { name: 'เพิ่มจุดติดตั้ง CCTV' });
    await add.getByRole('button', { name: /ใช้ตำแหน่งปัจจุบัน/ }).tap();
    const err = add.getByRole('alert');
    await expect(err).toContainText('ไม่สามารถรับตำแหน่งปัจจุบันได้');
    await err.getByRole('button', { name: 'เลือกตำแหน่งบนแผนที่' }).tap();
    await expect(add).toBeHidden();
    await expect(
      page.getByText('แตะตำแหน่งที่ต้องการติดตั้งกล้อง'),
    ).toBeVisible();
    await tapGoogleMap(page, 13.745, 100.565);
    await expect(page.getByTestId('picked-marker')).toBeVisible();
    await page.getByRole('button', { name: 'ยืนยันตำแหน่ง' }).tap();
    const form = page.getByRole('dialog', { name: 'จุดกล้องใหม่' });
    await expect(form).toContainText('เลือกบนแผนที่');
    await form.getByLabel('ชื่อ / รหัสกล้อง').fill('NOGPS-01');
    await form.getByRole('button', { name: 'บันทึก' }).tap();
    await expect(page.getByText('✓ บันทึก NOGPS-01 สำเร็จ')).toBeVisible();
    await expect(googleMarker(page, 'NOGPS-01')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
