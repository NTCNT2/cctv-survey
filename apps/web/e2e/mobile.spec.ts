import { expect, test, type Page } from '@playwright/test';
import {
  adminApi,
  blockTiles,
  mapMarker,
  projectList,
  seedProject,
  storage,
} from './env';

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

test.describe('survey map (GPS ±5 m)', () => {
  test.use({
    storageState: storage.admin,
    permissions: ['geolocation'],
    geolocation: { latitude: 13.7401, longitude: 100.5602, accuracy: 5 },
  });

  test('GPS, markers, add by GPS and by map picker, survives reload', async ({
    page,
  }) => {
    await blockTiles(page);
    await page.goto(`/projects/${seeded.project.id}/map`);
    const gps = page.getByTestId('gps-status');
    await expect(gps).toContainText('GPS พร้อม');
    await expect(gps).toContainText('±5.0 ม.');
    await expect(mapMarker(page, 'CAM-01')).toBeVisible();
    await expectNoHorizontalScroll(page);

    // FAB above the map menu, all controls tappable.
    const fab = page.getByRole('button', { name: 'เพิ่มจุด' });
    const nav = page.getByRole('navigation', { name: 'เมนูแผนที่' });
    expect(
      (await fab.boundingBox())!.y + (await fab.boundingBox())!.height,
    ).toBeLessThanOrEqual((await nav.boundingBox())!.y);

    // 1) Add with the current GPS position.
    await fab.tap();
    const add = page.getByRole('dialog', { name: 'เพิ่มจุดติดตั้ง CCTV' });
    await add.getByRole('button', { name: /ใช้ตำแหน่งปัจจุบัน/ }).tap();
    const form = page.getByRole('dialog', { name: 'จุดกล้องใหม่' });
    await expect(form).toBeVisible();
    await expect(form.getByLabel('ชื่อ / รหัสกล้อง')).toHaveValue('CCTV-001');
    await expect(form.getByLabel('ละติจูด (lat)')).toHaveValue('13.7401');
    await expect(form.getByLabel('ลองจิจูด (lng)')).toHaveValue('100.5602');
    await expect(form.getByLabel('ความแม่นยำ GPS (ม.)')).toHaveValue('5');
    await form.getByRole('button', { name: 'บันทึก' }).tap();
    await expect(page.getByText('✓ บันทึก CCTV-001 สำเร็จ')).toBeVisible();
    await expect(form).toBeHidden();
    await expect(mapMarker(page, 'CCTV-001')).toBeVisible();

    // 2) Add by moving the map under the crosshair.
    await fab.tap();
    await add.getByRole('button', { name: /เลือกตำแหน่งบนแผนที่/ }).tap();
    await expect(page.getByText('เลื่อนแผนที่เพื่อเลือกตำแหน่ง')).toBeVisible();
    // Move the map (keyboard panning) so the new point is not on CCTV-001.
    const before = await page.getByTestId('pick-coords').textContent();
    await page.getByRole('region', { name: 'แผนที่สำรวจ' }).focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('pick-coords')).not.toHaveText(before!);
    await page.getByRole('button', { name: 'ยืนยันตำแหน่ง' }).tap();
    await expect(form.getByLabel('ชื่อ / รหัสกล้อง')).toHaveValue('CCTV-002');
    await form.getByRole('button', { name: 'บันทึก' }).tap();
    await expect(page.getByText('✓ บันทึก CCTV-002 สำเร็จ')).toBeVisible();

    // 3) Reload: both points come back from the API.
    await page.reload();
    await expect(mapMarker(page, 'CCTV-001')).toBeVisible();
    await expect(mapMarker(page, 'CCTV-002')).toBeVisible();

    // 4) Marker detail. Zoomed out, CCTV-001 and -002 (a few metres apart)
    // are drawn on top of each other: tapping offers both.
    await page.getByRole('region', { name: 'แผนที่สำรวจ' }).focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('-');
    await mapMarker(page, 'CCTV-002').tap();
    const near = page.getByRole('dialog', { name: /จุดที่อยู่ใกล้กัน/ });
    await expect(near).toBeVisible();
    await near.getByRole('button', { name: /CCTV-001/ }).tap();
    const detail = page.getByRole('dialog', { name: 'CCTV-001' });
    await expect(detail).toContainText('สำรวจแล้ว');
    await expect(detail).toContainText('13.740100');
    await expect(detail.getByRole('link', { name: 'แก้ไข' })).toBeVisible();
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
    await blockTiles(page);
    await page.goto(`/projects/${seeded.project.id}/map`);
    await expect(page.getByTestId('gps-status')).toContainText('GPS อ่อน');
    await expect(
      page.getByText('ความแม่นยำ GPS ต่ำ แนะนำให้รอสัญญาณก่อนบันทึกจุด'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'เพิ่มจุด' }).tap();
    await page
      .getByRole('dialog', { name: 'เพิ่มจุดติดตั้ง CCTV' })
      .getByRole('button', { name: /ใช้ตำแหน่งปัจจุบัน/ })
      .tap();
    const form = page.getByRole('dialog', { name: 'จุดกล้องใหม่' });
    await expect(form).toContainText('ยังบันทึกได้');
    await form.getByLabel('ชื่อ / รหัสกล้อง').fill('WEAK-01');
    await form.getByRole('button', { name: 'บันทึก' }).tap();
    await expect(page.getByText('✓ บันทึก WEAK-01 สำเร็จ')).toBeVisible();
  });
});
