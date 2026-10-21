import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { devices, expect, test, type Page } from '@playwright/test';
import { adminApi, pickCamera, projectList, seedProject, storage } from './env';
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
  // A phone widens its layout viewport to fit wide content, so innerWidth
  // alone can grow with the page: compare with the device width too.
  expect(viewport, 'layout wider than the device').toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
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
    await expect(page.getByLabel('รหัสกล้อง')).toHaveValue('CAM-01');
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
    // Phones: the user menu sits on the header band of /projects.
    await page.getByTestId('current-user-band').tap();
    await expect(
      page.getByRole('link', { name: 'เปลี่ยนรหัสผ่าน' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'ออกจากระบบ' }),
    ).toBeVisible();
  });

  test('dashboard, survey map and reports: bottom nav, fit the screen', async ({
    page,
  }, info) => {
    await stubGoogleMaps(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
    const nav = page.getByRole('navigation', { name: 'เมนูหลัก (มือถือ)' });
    await expect(nav.getByRole('link')).toHaveText([
      'แดชบอร์ด',
      'โครงการ',
      'แผนที่สำรวจ',
      'รายงาน',
      'ตั้งค่า',
    ]);
    await expect(page.getByTestId('day-bar')).toHaveCount(30);
    await expectNoHorizontalScroll(page);
    await info.attach('dashboard', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    await nav.getByRole('link', { name: 'แผนที่สำรวจ' }).tap();
    await expect(page).toHaveURL(/\/map$/);
    await expect(page.locator('[data-map-engine="google"]')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await nav.getByRole('link', { name: 'รายงาน' }).tap();
    await page
      .getByRole('list', { name: 'โครงการสำหรับรายงาน' })
      .getByRole('link', { name: new RegExp(seeded.project.name) })
      // A retried worker seeds the same name again: either one will do.
      .first()
      .tap();
    await expect(
      page.getByRole('table', { name: 'ตารางจุดกล้อง' }),
    ).toBeVisible();
    // The wide table scrolls inside its card, never the page.
    await expectNoHorizontalScroll(page);
    await info.attach('report', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });

  for (const width of [375, 430]) {
    test(`${width}px: dashboard header band, tap targets, no sideways scroll`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 860 });
      await page.goto('/dashboard');
      const band = page.getByRole('main').locator('header').first();
      // Logo, bell and user menu live on the band; no separate top bar.
      await expect(
        band.getByRole('button', { name: 'การแจ้งเตือน' }),
      ).toBeVisible();
      await expect(band.getByTestId('current-user-band')).toBeVisible();
      await expect(page.getByTestId('current-user')).toBeHidden();
      await expect(page.getByTestId('day-bar')).toHaveCount(30);
      await expectNoHorizontalScroll(page);
      for (const b of await page
        .getByRole('main')
        .locator('a[href], button')
        .filter({ visible: true })
        .all()) {
        if (await b.evaluate((el) => !!el.closest('details, li'))) continue;
        const box = await b.boundingBox();
        expect(
          box?.height ?? 0,
          (await b.getAttribute('aria-label')) ?? (await b.innerText()),
        ).toBeGreaterThanOrEqual(44);
      }
      // The user menu opens from the band.
      await band.getByTestId('current-user-band').tap();
      await expect(
        page.getByRole('button', { name: 'ออกจากระบบ' }),
      ).toBeVisible();
      await info.attach(`dashboard-${width}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    });
  }

  for (const width of [375, 430]) {
    test(`${width}px: projects header band, controls, last card clear of the nav`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 860 });
      await page.goto('/projects');
      const band = page.getByRole('main').locator('header').first();
      await expect(
        band.getByRole('heading', { name: 'โครงการ' }),
      ).toBeVisible();
      await expect(band.getByTestId('current-user-band')).toBeVisible();
      await expect(page.getByTestId('current-user')).toBeHidden();
      await expect(
        band.getByRole('link', { name: '+ สร้างโครงการ' }),
      ).toBeVisible();
      await expectNoHorizontalScroll(page);

      const h = async (l: import('@playwright/test').Locator) =>
        (await l.boundingBox())!.height;
      expect(
        await h(page.getByRole('searchbox', { name: 'ค้นหาในรายการโครงการ' })),
      ).toBeGreaterThanOrEqual(48);
      for (const name of ['กรองตามสถานะ', 'กรองตามลูกค้า']) {
        expect(
          await h(page.getByRole('combobox', { name })),
        ).toBeGreaterThanOrEqual(44);
      }
      for (const name of ['แสดงแบบการ์ด', 'แสดงแบบรายการ']) {
        const b = page.getByRole('button', { name });
        const box = (await b.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }

      // The last card scrolls fully above the bottom navigation.
      const cards = projectList(page).getByRole('listitem');
      await cards.last().scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const last = (await cards.last().boundingBox())!;
      const nav = (await page
        .getByRole('navigation', { name: 'เมนูหลัก (มือถือ)' })
        .boundingBox())!;
      expect(
        last.y + last.height,
        'last card under the nav',
      ).toBeLessThanOrEqual(nav.y);

      // No match: icon, message and "clear filters".
      await page
        .getByRole('searchbox', { name: 'ค้นหาในรายการโครงการ' })
        .fill('zz-no-such-project-zz');
      await expect(
        page.getByText('ไม่พบโครงการที่ตรงกับเงื่อนไข'),
      ).toBeVisible();
      const clear = page
        .getByRole('main')
        .getByRole('button', { name: 'ล้างตัวกรอง' })
        .last();
      expect(await h(clear)).toBeGreaterThanOrEqual(44);
      await info.attach(`projects-${width}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      await clear.tap();
      await expect(cards.first()).toBeVisible();
    });
  }

  test('users page: from the user menu, fits the screen, form usable', async ({
    page,
  }, info) => {
    await page.goto('/projects');
    // Phones: the user menu sits on the header band of /projects.
    await page.getByTestId('current-user-band').tap();
    await page.getByRole('link', { name: 'จัดการผู้ใช้' }).tap();
    await expect(page).toHaveURL(/\/users$/);
    await expect(
      page.getByRole('list', { name: 'รายการผู้ใช้' }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: '+ เพิ่มผู้ใช้' }).tap();
    await page.getByRole('radio', { name: 'วิศวกร', exact: true }).tap();
    await expect(
      page.getByRole('radio', { name: 'วิศวกร', exact: true }),
    ).toBeChecked();
    await page.getByRole('button', { name: 'สุ่มรหัสผ่าน' }).tap();
    await expect(page.getByLabel('รหัสผ่านเริ่มต้น')).toHaveAttribute(
      'type',
      'text',
    );
    await expectNoHorizontalScroll(page);
    for (const b of await page.getByRole('main').getByRole('button').all()) {
      const box = await b.boundingBox();
      expect(box?.height ?? 0, await b.innerText()).toBeGreaterThanOrEqual(44);
    }
    await info.attach('users-form', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await page.getByRole('button', { name: 'ยกเลิก' }).tap();
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
    const form = page.getByRole('dialog', { name: 'เพิ่มกล้อง' });
    await expect(form).toContainText('จาก GPS');
    await expect(form.getByLabel('รหัสกล้อง')).toHaveValue('CCTV-001');
    await expect(form.getByLabel('ละติจูด (lat)')).toHaveValue('13.7401');
    await expect(form.getByLabel('ลองจิจูด (lng)')).toHaveValue('100.5602');
    await expect(form.getByLabel('GPS Accuracy (±ม.)')).toHaveValue('5');
    await pickCamera(form);
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
    await expect(form.getByLabel('รหัสกล้อง')).toHaveValue('CCTV-002');
    await expect(form.getByLabel('ละติจูด (lat)')).toHaveValue('13.75');
    // A picked point has no GPS accuracy.
    await expect(form.getByLabel('GPS Accuracy (±ม.)')).toHaveValue('');
    await pickCamera(form);
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
    await expect(detail).toContainText('GPS Accuracy ±5 m');
    await expect(detail).toContainText('IPC2122LB-AF28-ECO');
    await expect(detail).toContainText('Dome · 5 MP');
    await expect(
      detail.getByRole('link', { name: 'แก้ไขข้อมูลกล้อง' }),
    ).toHaveAttribute('href', /\/cameras\/.+\/edit$/);
    await expect(
      detail.getByRole('link', { name: /รายละเอียด Survey/ }),
    ).toHaveAttribute('href', /\/cameras\/.+\/survey$/);
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
    const form = page.getByRole('dialog', { name: 'เพิ่มกล้อง' });
    await expect(form).toContainText('ยังบันทึกได้');
    await expect(page.getByTestId('gps-status')).toContainText('GPS อ่อน');
    await form.getByLabel('รหัสกล้อง').fill('WEAK-01');
    await pickCamera(form);
    await form.getByRole('button', { name: 'บันทึก' }).tap();
    await expect(page.getByText('✓ บันทึก WEAK-01 สำเร็จ')).toBeVisible();
  });
});

test.describe('camera form on a phone (iPhone flow)', () => {
  test.use({
    storageState: storage.surveyor,
    permissions: ['geolocation'],
    geolocation: { latitude: 15.1201, longitude: 100.5402, accuracy: 2 },
  });

  test('walk up → add → GPS → brand → model → photo → save, save bar always reachable', async ({
    page,
  }, info) => {
    await stubGoogleMaps(page);
    await page.goto(`/projects/${seeded.project.id}/map`);
    await expect(googleMarker(page, 'CAM-01')).toBeVisible();

    // 1) เพิ่มกล้อง  2) GPS ปัจจุบัน
    await page.getByRole('button', { name: 'เพิ่มจุดติดตั้ง' }).tap();
    await page
      .getByRole('dialog', { name: 'เพิ่มจุดติดตั้ง CCTV' })
      .getByRole('button', { name: /ใช้ตำแหน่งปัจจุบัน/ })
      .tap();
    const form = page.getByRole('dialog', { name: 'เพิ่มกล้อง' });
    await expect(form.getByLabel('ละติจูด (lat)')).toHaveValue('15.1201');
    await expect(form.getByLabel('ลองจิจูด (lng)')).toHaveValue('100.5402');
    await expect(form.getByLabel('GPS Accuracy (±ม.)')).toHaveValue('2');

    // 3) ยี่ห้อ  4) รุ่น → MP + type shown, nothing typed
    await pickCamera(form);
    await expect(form.getByTestId('camera-spec')).toHaveText('5 MP · Dome');

    // 5) ถ่ายรูปหน้างาน (camera input) → thumbnail → preview
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 1200;
      c.height = 1600;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#0ea5e9';
      ctx.fillRect(0, 0, 1200, 1600);
      return c.toDataURL('image/png').split(',')[1];
    });
    const camInput = form.getByLabel('ถ่ายรูปหน้างาน');
    await expect(camInput).toHaveAttribute('capture', 'environment');
    await expect(form.getByLabel('+ เพิ่มรูป')).toHaveAttribute(
      'accept',
      'image/*',
    );
    await camInput.setInputFiles({
      name: 'site.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    });
    const pending = form.getByRole('list', { name: 'รูปที่จะบันทึก' });
    await expect(pending.locator('img')).toHaveCount(1);
    await pending.getByRole('button', { name: /ดูรูปที่ 1/ }).tap();
    const editor = page.getByRole('dialog', { name: 'รูปหน้างาน' });
    const big = editor.getByRole('img', { name: 'รูปหน้างาน' });
    await expect(big).toBeInViewport();
    await expect(
      editor.getByRole('button', { name: 'บันทึกรูป' }),
    ).toBeInViewport();
    await expect(editor.getByRole('button', { name: 'ปิด' })).toBeInViewport();
    await info.attach('photo-preview', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await editor.getByLabel('ประเภทรูป').selectOption('cabinet_equipment');
    await editor.getByRole('button', { name: 'บันทึกรูป' }).tap();
    await expect(pending).toContainText('ตู้ควบคุม/อุปกรณ์');

    // Every section is reachable and the save bar stays on screen, never
    // covering the field in view; nothing scrolls sideways.
    const save = form.getByRole('button', { name: 'บันทึก', exact: true });
    for (const name of [
      'ตำแหน่ง',
      'กล้อง',
      'จุดติดตั้ง',
      'ระบบ',
      'รูปหน้างาน',
      'สถานะ',
    ]) {
      const heading = form.getByRole('heading', { name, exact: true });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading, name).toBeInViewport();
      await expect(save, name).toBeInViewport();
    }
    // Focus (as the keyboard does) scrolls the field clear of the save bar.
    const notes = form.getByLabel('หมายเหตุ (ไม่บังคับ)');
    await notes.focus();
    const n = (await notes.boundingBox())!;
    const b = (await save.boundingBox())!;
    expect(n.y + n.height, 'last field above the save bar').toBeLessThanOrEqual(
      b.y,
    );
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.y + b.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await expectNoHorizontalScroll(page);
    await info.attach('camera-form-sheet', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    // 6) บันทึก
    await save.tap();
    await expect(
      page.getByText(/✓ บันทึก CCTV-\d+ สำเร็จ \(รูป 1\)/),
    ).toBeVisible();
    await expect(form).toBeHidden();

    // Marker detail: camera and the photo with its type
    const label = (await page
      .getByText(/✓ บันทึก (CCTV-\d+)/)
      .textContent())!.match(/CCTV-\d+/)![0];
    await googleMarker(page, label).tap();
    const detail = page.getByRole('dialog', { name: label });
    await expect(detail).toContainText('GPS Accuracy ±2 m');
    await expect(detail).toContainText('Dome · 5 MP');
    await expect(detail).toContainText('รูปหน้างาน (1)');
    await expect(detail).toContainText('ตู้ควบคุม/อุปกรณ์');
    const thumb = detail
      .getByRole('list', { name: 'รูปหน้างาน' })
      .locator('img')
      .first();
    await expect
      .poll(() => thumb.evaluate((e: HTMLImageElement) => e.naturalWidth))
      .toBeGreaterThan(0);
    await expectNoHorizontalScroll(page);
  });

  test('page form: save bar sits above the bottom navigation, never over a field', async ({
    page,
  }, info) => {
    await page.goto(`/projects/${seeded.project.id}/cameras/new`);
    const save = page.getByRole('button', { name: 'บันทึก', exact: true });
    const nav = page.getByRole('navigation', { name: 'เมนูหลัก (มือถือ)' });
    await expect(save).toBeInViewport();
    const check = async (where: string) => {
      const b = (await save.boundingBox())!;
      const v = (await nav.boundingBox())!;
      expect(b.y + b.height, `${where}: save above nav`).toBeLessThanOrEqual(
        v.y,
      );
    };
    await check('top');
    // GPS button fills lat / lng / accuracy.
    await page.getByRole('button', { name: 'ใช้ตำแหน่งปัจจุบัน' }).tap();
    await expect(page.getByLabel('GPS Accuracy (±ม.)')).toHaveValue('2');
    await expect(page.getByLabel('ละติจูด (lat)')).toHaveValue('15.1201000');
    const notes = page.getByLabel('หมายเหตุ (ไม่บังคับ)');
    await notes.focus();
    await check('bottom');
    const n = (await notes.boundingBox())!;
    expect(n.y + n.height, 'last field above the save bar').toBeLessThanOrEqual(
      (await save.boundingBox())!.y,
    );
    await expectNoHorizontalScroll(page);
    await info.attach('camera-form-page', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
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
    const form = page.getByRole('dialog', { name: 'เพิ่มกล้อง' });
    await expect(form).toContainText('เลือกบนแผนที่');
    await form.getByLabel('รหัสกล้อง').fill('NOGPS-01');
    await pickCamera(form);
    await form.getByRole('button', { name: 'บันทึก' }).tap();
    await expect(page.getByText('✓ บันทึก NOGPS-01 สำเร็จ')).toBeVisible();
    await expect(googleMarker(page, 'NOGPS-01')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('Add Point Bottom Sheet options are visible and clickable', () => {
  test.use({ storageState: storage.admin });

  for (const [width, height] of [
    [375, 812],
    [390, 844],
    [430, 932],
    [360, 800],
    // iPhone 13 Pro Max: measured on the device, Playwright's profile, and
    // Safari with collapsed toolbars.
    [428, 761],
    [428, 746],
    [428, 926],
  ] as const) {
    test(`${width}×${height}: both options on screen without scrolling, pick flow works`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await stubGoogleMaps(page);
      await page.goto(`/projects/${seeded.project.id}/map`);
      await expect(googleMarker(page, 'CAM-01')).toBeVisible();

      await page.getByRole('button', { name: 'เพิ่มจุดติดตั้ง' }).tap();
      const sheet = page.getByRole('dialog', { name: 'เพิ่มจุดติดตั้ง CCTV' });
      await expect(sheet).toBeVisible();
      // The page behind is modal: its bottom navigation and FAB are hidden.
      await expect(
        page.getByRole('navigation', { name: 'เมนูแผนที่' }),
      ).toBeHidden();

      const options = [
        sheet.getByRole('button', { name: /ใช้ตำแหน่งปัจจุบัน/ }),
        sheet.getByRole('button', { name: /เลือกตำแหน่งบนแผนที่/ }),
        sheet.getByRole('button', { name: 'ยกเลิก' }),
      ];
      const sheetBox = (await sheet.boundingBox())!;
      expect(sheetBox.y).toBeGreaterThanOrEqual(0);
      expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(height + 1);
      for (const o of options) {
        await expect(o).toBeVisible();
        const b = (await o.boundingBox())!;
        // Fully on screen and inside the sheet as laid out (no scrolling).
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.y).toBeGreaterThanOrEqual(sheetBox.y);
        expect(b.y + b.height).toBeLessThanOrEqual(
          Math.min(height, sheetBox.y + sheetBox.height),
        );
      }
      // Nothing inside the sheet needs scrolling at this size.
      const scrolls = await sheet.evaluate((d) =>
        [...d.querySelectorAll('*')].some(
          (e) =>
            e.scrollHeight > e.clientHeight + 1 &&
            getComputedStyle(e).overflowY !== 'visible',
        ),
      );
      expect(scrolls).toBe(false);

      // iOS regression (Safari ≤ 16 collapsed a basis-0 scroll body to 0 px):
      // header / footer never shrink, the body is content-sized and scrolls.
      const layout = await sheet.evaluate((d) => {
        const css = (sel: string) => getComputedStyle(d.querySelector(sel)!);
        const body = d.querySelector<HTMLElement>('[data-sheet-body]')!;
        return {
          display: getComputedStyle(d).display,
          direction: getComputedStyle(d).flexDirection,
          header: css('[data-sheet-header]').flex,
          footer: css('[data-sheet-footer]').flex,
          footerPosition: css('[data-sheet-footer]').position,
          footerPaddingBottom: css('[data-sheet-footer]').paddingBottom,
          footerSafeArea: !!d.querySelector(
            '[data-sheet-footer] > [data-sheet-safe-area]',
          ),
          footerInBody: !!body.querySelector('[data-sheet-footer]'),
          basis: css('[data-sheet-body]').flexBasis,
          minHeight: css('[data-sheet-body]').minHeight,
          overflow: css('[data-sheet-body]').overflowY,
          blockPadding: [
            css('[data-sheet-body]').paddingTop,
            css('[data-sheet-body]').paddingBottom,
          ].join(' '),
          collapsed: body.clientHeight < body.scrollHeight - 1,
        };
      });
      expect(layout).toEqual({
        display: 'flex',
        direction: 'column',
        header: '0 0 auto',
        footer: '0 0 auto',
        footerPosition: 'static',
        footerPaddingBottom: '0px',
        footerSafeArea: true,
        footerInBody: false,
        basis: 'auto',
        minHeight: '0px',
        overflow: 'auto',
        blockPadding: '0px 0px',
        collapsed: false,
      });
      // The footer (ยกเลิก) sits below the options, never on top of them.
      const footerTop = (await sheet
        .locator('[data-sheet-footer]')
        .boundingBox())!.y;
      const lastOption = (await options[1].boundingBox())!;
      expect(lastOption.y + lastOption.height).toBeLessThanOrEqual(footerTop);

      await options[1].tap();
      await expect(sheet).toBeHidden();
      await expect(
        page.getByText('แตะตำแหน่งที่ต้องการติดตั้งกล้อง'),
      ).toBeVisible();
      await tapGoogleMap(page, 13.7444, 100.5555);
      await expect(page.getByTestId('picked-marker')).toBeVisible();
      await page.getByRole('button', { name: 'ยืนยันตำแหน่ง' }).tap();
      const form = page.getByRole('dialog', { name: 'เพิ่มกล้อง' });
      await expect(form).toContainText('เลือกบนแผนที่');
      await expect(form.getByLabel('ละติจูด (lat)')).toHaveValue('13.7444');
      await expect(
        form.getByRole('button', { name: 'บันทึก' }),
      ).toBeInViewport();
    });
  }
});

test.describe('Add Point Bottom Sheet on a short screen', () => {
  test.use({ storageState: storage.admin });

  test('360×480: the options scroll inside the sheet, header and footer stay', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 480 });
    await stubGoogleMaps(page);
    await page.goto(`/projects/${seeded.project.id}/map`);
    await page.getByRole('button', { name: 'เพิ่มจุดติดตั้ง' }).tap();
    const sheet = page.getByRole('dialog', { name: 'เพิ่มจุดติดตั้ง CCTV' });
    // Make the content taller than the sheet can be.
    await sheet.evaluate((d) => {
      const body = d.querySelector('[data-sheet-body]')!;
      const pad = document.createElement('div');
      pad.style.height = '400px';
      body.prepend(pad);
    });
    const body = sheet.locator('[data-sheet-body]');
    const m = await body.evaluate((b) => ({
      scrolls: b.scrollHeight > b.clientHeight,
      page: document.documentElement.scrollHeight <= innerHeight,
    }));
    expect(m).toEqual({ scrolls: true, page: true });
    const box = (await sheet.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(480 + 1);
    await expect(sheet.getByRole('heading')).toBeInViewport();
    await expect(sheet.getByRole('button', { name: 'ปิด' })).toBeInViewport();
    await expect(
      sheet.getByRole('button', { name: 'ยกเลิก' }),
    ).toBeInViewport();
    // Scroll the body (not the page) to reach the second option, then use it.
    await body.evaluate((b) => (b.scrollTop = b.scrollHeight));
    const pick = sheet.getByRole('button', { name: /เลือกตำแหน่งบนแผนที่/ });
    await expect(pick).toBeInViewport();
    await pick.tap();
    await expect(sheet).toBeHidden();
    await expect(
      page.getByText('แตะตำแหน่งที่ต้องการติดตั้งกล้อง'),
    ).toBeVisible();
  });
});

test.describe('Add Point Bottom Sheet screenshot', () => {
  test.use({ storageState: storage.admin });

  for (const [width, height, name] of [
    [390, 844, '390x844'],
    [428, 746, 'iphone-13-pro-max'],
  ] as const) {
    test(`${name}: header, both options and footer as designed`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height });
      await stubGoogleMaps(page);
      await page.goto(`/projects/${seeded.project.id}/map`);
      await expect(googleMarker(page, 'CAM-01')).toBeVisible();
      await page.getByRole('button', { name: 'เพิ่มจุดติดตั้ง' }).tap();
      const sheet = page.getByRole('dialog', {
        name: 'เพิ่มจุดติดตั้ง CCTV',
      });
      await expect(
        sheet.getByRole('button', { name: /เลือกตำแหน่งบนแผนที่/ }),
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      // The real sheet DOM + CSS, for scripts/webkit-sheet-check.sh (older
      // WebKit builds, closer to shipping Safari than Playwright's WebKit).
      const html = await page.evaluate(() => {
        const css = [...document.styleSheets]
          .map((sh) => {
            try {
              return [...sh.cssRules].map((r) => r.cssText).join('\n');
            } catch {
              return '';
            }
          })
          .join('\n')
          .replaceAll('url("/_next/', `url("${location.origin}/_next/`);
        const d = document.querySelector('dialog[open]')!.cloneNode(true);
        (d as HTMLDialogElement).removeAttribute('open');
        return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>${css}</style></head><body class="${document.body.className}">${(d as HTMLElement).outerHTML}<script>document.querySelector('dialog').showModal()</script></body></html>`;
      });
      const dir = path.join(testInfo.project.outputDir, 'sheet-dom');
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, `${testInfo.project.name}-${name}.html`),
        html,
      );

      // The sheet only: the map behind it carries per-run data.
      await expect(sheet).toHaveScreenshot(`add-point-sheet-${name}.png`, {
        animations: 'disabled',
        caret: 'hide',
      });
    });
  }
});

// iPhone 13 Pro Max (Safari user agent, 3× screen, touch); in the
// iphone-webkit project this runs in WebKit.
// test.use() cannot change the browser inside a file: keep the project's.
const iPhone13ProMax = Object.fromEntries(
  Object.entries(devices['iPhone 13 Pro Max']).filter(
    ([k]) => k !== 'defaultBrowserType',
  ),
);

test.describe('Add Point Bottom Sheet — iPhone 13 Pro Max', () => {
  // Viewport measured on the physical device (Safari, toolbars shown).
  test.use({
    ...iPhone13ProMax,
    viewport: { width: 428, height: 761 },
    storageState: storage.admin,
  });

  test('options and cancel: real boxes, inside the viewport, not covered; content scrolls', async ({
    page,
  }) => {
    await stubGoogleMaps(page);
    await page.goto(`/projects/${seeded.project.id}/map`);
    await expect(googleMarker(page, 'CAM-01')).toBeVisible();
    await page.getByRole('button', { name: 'เพิ่มจุดติดตั้ง' }).tap();
    const sheet = page.getByRole('dialog', { name: 'เพิ่มจุดติดตั้ง CCTV' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('heading')).toHaveText('เพิ่มจุดติดตั้ง CCTV');
    const first = await sheet.boundingBox();

    // The collapse seen on the physical iPhone: sheet 177 px, scroll area
    // 20 px (its padding) with 172 px of content, footer over the options.
    const m = await sheet.evaluate((d) => {
      const body = d.querySelector<HTMLElement>('[data-sheet-body]')!;
      const footer = d.querySelector('[data-sheet-footer]')!;
      const options = [...body.querySelectorAll('button')];
      return {
        sheet: d.getBoundingClientRect().height,
        parts: [...d.children].reduce(
          (sum, c) => sum + c.getBoundingClientRect().height,
          0,
        ),
        clientHeight: body.clientHeight,
        scrollHeight: body.scrollHeight,
        footerTop: footer.getBoundingClientRect().top,
        lastOptionBottom: options.at(-1)!.getBoundingClientRect().bottom,
      };
    });
    expect(m.sheet).toBeGreaterThan(177);
    // Content-sized, not stretched to its max-height: grip + header +
    // content + footer is the whole sheet.
    expect(Math.abs(m.sheet - m.parts)).toBeLessThanOrEqual(1);
    expect(m.sheet).toBeLessThan(761 * 0.6);
    expect(m.clientHeight).toBeGreaterThan(20);
    expect(m.scrollHeight).toBeGreaterThanOrEqual(m.clientHeight);
    // Two options fit: nothing is hidden behind a scroll.
    expect(m.clientHeight).toBeGreaterThanOrEqual(m.scrollHeight - 1);
    expect(m.lastOptionBottom).toBeLessThanOrEqual(m.footerTop);

    const boxes = await sheet.evaluate((d) => {
      const names = ['ใช้ตำแหน่งปัจจุบัน', 'เลือกตำแหน่งบนแผนที่', 'ยกเลิก'];
      const buttons = [...d.querySelectorAll('button')];
      return names.map((n) => {
        const b = buttons.find((x) => x.textContent?.includes(n))!;
        const r = b.getBoundingClientRect();
        // Probe 5 points inside the button: each must hit the button itself.
        const probes = [
          [0.5, 0.5],
          [0.15, 0.2],
          [0.85, 0.2],
          [0.15, 0.8],
          [0.85, 0.8],
        ].map(([x, y]) => {
          const hit = document.elementFromPoint(
            r.left + r.width * x,
            r.top + r.height * y,
          );
          return !!hit && b.contains(hit);
        });
        return {
          name: n,
          width: r.width,
          height: r.height,
          inside:
            r.left >= 0 &&
            r.top >= 0 &&
            r.right <= innerWidth &&
            r.bottom <= innerHeight,
          uncovered: probes.every(Boolean),
        };
      });
    });
    for (const b of boxes) {
      expect(b.width, b.name).toBeGreaterThan(0);
      expect(b.height, b.name).toBeGreaterThanOrEqual(44);
      expect(b.inside, `${b.name} inside the viewport`).toBe(true);
      expect(b.uncovered, `${b.name} not covered`).toBe(true);
    }

    // No horizontal overflow, page or sheet.
    const overflow = await sheet.evaluate((d) => ({
      page: document.documentElement.scrollWidth <= innerWidth,
      sheet: d.scrollWidth <= d.clientWidth,
      body: (() => {
        const b = d.querySelector<HTMLElement>('[data-sheet-body]')!;
        return b.scrollWidth <= b.clientWidth;
      })(),
    }));
    expect(overflow).toEqual({ page: true, sheet: true, body: true });

    // No layout shift after the sheet settles.
    await page.waitForTimeout(600);
    expect(await sheet.boundingBox()).toEqual(first);

    // More content than fits: the scroll area (only it) scrolls.
    const body = sheet.locator('[data-sheet-body]');
    const scroll = await body.evaluate((b) => {
      const extra = document.createElement('div');
      extra.style.height = '900px';
      b.firstElementChild!.prepend(extra);
      const before = {
        scrollHeight: b.scrollHeight,
        clientHeight: b.clientHeight,
      };
      b.scrollTop = 0;
      b.scrollBy(0, 400);
      return { ...before, scrolled: b.scrollTop, page: scrollY };
    });
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
    expect(scroll.clientHeight).toBeGreaterThan(100);
    expect(scroll.scrolled).toBeGreaterThan(0);
    expect(scroll.page).toBe(0);
    const sheetBox = (await sheet.boundingBox())!;
    expect(sheetBox.y).toBeGreaterThanOrEqual(0);
    expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(
      page.viewportSize()!.height + 1,
    );
    await expect(
      sheet.getByRole('button', { name: 'ยกเลิก' }),
    ).toBeInViewport();
    await expect(sheet.getByRole('heading')).toBeInViewport();
  });
});

test.describe('survey detail on a phone', () => {
  test.use({ storageState: storage.surveyor });

  test('camera → survey → fill in with the keyboard and taps → save → back', async ({
    page,
  }, info) => {
    const id = seeded.camera!.id;
    await page.goto(`/cameras/${id}`);
    const detail = page.getByTestId('camera-detail');
    await detail.getByRole('link', { name: /รายละเอียด Survey/ }).tap();
    await expect(page).toHaveURL(/\/survey$/);
    await expectNoHorizontalScroll(page);

    // Numbers open the numeric keyboard; common values are one tap.
    const height = page.getByLabel('1. ความสูงติดตั้งกล้อง (ม.)');
    await expect(height).toHaveAttribute('inputmode', 'decimal');
    await page
      .getByRole('group', { name: 'ความสูงติดตั้ง: ค่าที่ใช้บ่อย' })
      .getByRole('button', { name: '5 ม.' })
      .tap();
    await expect(height).toHaveValue('5');
    await page
      .getByRole('group', { name: 'ทิศทางกล้อง: ค่าที่ใช้บ่อย' })
      .getByRole('button', { name: 'ทิศเหนือ (0°)' })
      .tap();
    await page
      .getByRole('group', { name: '5. โครงสร้างติดตั้ง' })
      .getByText('เสาไฟเดิม')
      .tap();
    await page.getByLabel('6. ความสูงเสา (ม.)').fill('8');
    await page
      .getByRole('group', { name: 'Network' })
      .getByText('มี', { exact: true })
      .tap();
    await page
      .getByRole('group', { name: 'Fiber' })
      .getByText('มี', { exact: true })
      .tap();
    await expectNoHorizontalScroll(page);

    // Every button and choice is large enough to tap.
    for (const el of await page
      .locator('form button, form label:has(input[type=radio]) > span')
      .all()) {
      if (!(await el.isVisible())) continue;
      const box = await el.boundingBox();
      expect(box!.height, await el.innerText()).toBeGreaterThanOrEqual(44);
    }

    // The optional part unfolds; the save bar stays on screen at the bottom.
    const save = page.getByRole('button', { name: 'บันทึก Survey' });
    await page.getByText('ข้อมูลเพิ่มเติม (ไม่บังคับ)').tap();
    await page.getByLabel('14. ความต้องการเพิ่มเติม / ปัญหาที่พบ').fill('—');
    await expect(save).toBeInViewport();
    await expectNoHorizontalScroll(page);
    await info.attach('survey-form', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await save.tap();
    await expect(page).toHaveURL(new RegExp(`/cameras/${id}$`));
    // Height, direction, structure, pole height, network/fiber (item 14 is
    // optional and not counted).
    await expect(
      detail.getByRole('link', { name: 'รายละเอียด Survey (5/9)' }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
