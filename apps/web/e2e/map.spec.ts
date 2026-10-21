import { expect, test } from '@playwright/test';
import {
  adminApi,
  blockTiles,
  mapMarker,
  pickCamera,
  seedProject,
  storage,
} from './env';
import { googleMarker, stubGoogleMaps, tapGoogleMap } from './google-maps-stub';

/** The same web build without Google Maps settings (production rules). */
const NOMAP_BASE = process.env.E2E_NOMAP_BASE_URL ?? 'http://127.0.0.1:3101';
/** ... and with the development OpenStreetMap fallback opted in. */
const OSM_BASE = process.env.E2E_OSM_BASE_URL ?? 'http://127.0.0.1:3102';

let seeded: Awaited<ReturnType<typeof seedProject>>;

test.beforeAll(async () => {
  const api = await adminApi();
  seeded = await seedProject(api, 'map');
  await api.dispose();
});

test.describe('survey map — Google Maps (stubbed), viewer', () => {
  test.use({ storageState: storage.viewer });

  test('desktop: markers, point list, search, detail; no add for viewers', async ({
    page,
  }) => {
    await stubGoogleMaps(page);
    await page.goto(`/projects/${seeded.project.id}`);
    await page
      .getByRole('main')
      .getByRole('link', { name: 'แผนที่สำรวจ' })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/projects/${seeded.project.id}/map$`),
    );
    await expect(page.locator('[data-map-engine="google"]')).toBeVisible();
    await expect(googleMarker(page, 'CAM-01')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'เพิ่มจุดติดตั้ง' }),
    ).toHaveCount(0);

    // Desktop: the point list is a side panel; a point opens its detail.
    await page.getByRole('button', { name: /จุดกล้อง \(1\)/ }).click();
    const list = page.getByRole('dialog', { name: 'จุดกล้อง (1)' });
    await list.getByRole('button', { name: /CAM-01/ }).click();
    const detail = page.getByRole('dialog', { name: 'CAM-01' });
    await expect(detail).toContainText('อาคาร A');
    await expect(
      detail.getByRole('link', { name: 'แก้ไขข้อมูลกล้อง' }),
    ).toHaveCount(0);
    await expect(detail.getByText('เพิ่มรูป')).toHaveCount(0);
    await expect(detail.getByRole('link', { name: 'นำทาง' })).toBeVisible();
    await page.keyboard.press('Escape');

    // Marker click opens the same detail.
    await googleMarker(page, 'CAM-01').click();
    await expect(page.getByRole('dialog', { name: 'CAM-01' })).toBeVisible();
    await page.keyboard.press('Escape');

    // Search within the project's points (no Places API).
    await page.getByLabel('ค้นหาจุดกล้องในโครงการ').fill('cam');
    await page
      .getByRole('list', { name: 'ผลการค้นหา' })
      .getByRole('button', { name: /CAM-01/ })
      .click();
    await expect(page.getByRole('dialog', { name: 'CAM-01' })).toBeVisible();
    const { scroll, width } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: innerWidth,
    }));
    expect(scroll).toBeLessThanOrEqual(width);
  });
});

test.describe('survey map — fallbacks', () => {
  test.use({ storageState: storage.admin });

  test('production, Google rejects the key: clear error, no switch to OSM', async ({
    page,
  }) => {
    let tiles = 0;
    await page.route(/tile\.openstreetmap\.org/, (r) => {
      tiles++;
      return r.abort();
    });
    await stubGoogleMaps(page, { authFail: true });
    await page.goto(`/projects/${seeded.project.id}/map`);
    const err = page.getByTestId('map-unavailable');
    await expect(err).toContainText('Google Maps ใช้งานไม่ได้');
    await expect(err).toContainText('ปฏิเสธ API key');
    await expect(
      err.getByRole('button', { name: 'โหลดหน้าใหม่' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /OpenStreetMap/ }),
    ).toHaveCount(0);
    await expect(page.locator('[data-map-engine="leaflet"]')).toHaveCount(0);
    // Picking needs a map; the GPS path stays available.
    await page.getByRole('button', { name: 'เพิ่มจุดติดตั้ง' }).click();
    const add = page.getByRole('dialog', { name: 'เพิ่มจุดติดตั้ง CCTV' });
    await expect(
      add.getByRole('button', { name: /เลือกตำแหน่งบนแผนที่/ }),
    ).toBeDisabled();
    await expect(
      add.getByRole('button', { name: /ใช้ตำแหน่งปัจจุบัน/ }),
    ).toBeEnabled();
    expect(tiles).toBe(0);
  });

  test('production without Google Maps settings: configuration error', async ({
    page,
  }) => {
    let calls = 0;
    await page.route(/maps\.googleapis\.com|tile\.openstreetmap\.org/, (r) => {
      calls++;
      return r.abort();
    });
    await page.goto(`${NOMAP_BASE}/projects/${seeded.project.id}/map`);
    const err = page.getByTestId('map-unavailable');
    await expect(err).toContainText('ยังไม่ได้ตั้งค่า Google Maps');
    await expect(err).toContainText('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
    await expect(err).toContainText('NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID');
    await expect(page.locator('[data-map-engine]')).toHaveCount(0);
    // The points stay reachable from the list.
    await page.getByRole('button', { name: /จุดกล้อง \(\d+\)/ }).click();
    await expect(
      page.getByRole('list', { name: 'จุดกล้องบนแผนที่' }),
    ).toContainText('CAM-01');
    expect(calls).toBe(0);
  });

  test('development fallback (opted in): OpenStreetMap with tap-to-pick', async ({
    page,
  }) => {
    await blockTiles(page);
    let googleCalls = 0;
    await page.route(/maps\.googleapis\.com/, (r) => {
      googleCalls++;
      return r.abort();
    });
    await page.goto(`${OSM_BASE}/projects/${seeded.project.id}/map`);
    await expect(page.locator('[data-map-engine="leaflet"]')).toBeVisible();
    await expect(mapMarker(page, 'CAM-01')).toBeVisible();
    await page.getByRole('button', { name: 'เพิ่มจุดติดตั้ง' }).click();
    await page
      .getByRole('dialog', { name: 'เพิ่มจุดติดตั้ง CCTV' })
      .getByRole('button', { name: /เลือกตำแหน่งบนแผนที่/ })
      .click();
    await page.getByRole('region', { name: 'แผนที่สำรวจ' }).click({
      position: { x: 300, y: 300 },
    });
    await expect(page.getByTestId('picked-marker')).toBeVisible();
    await page.getByRole('button', { name: 'ยืนยันตำแหน่ง' }).click();
    await expect(
      page.getByRole('dialog', { name: 'เพิ่มกล้อง' }),
    ).toContainText('เลือกบนแผนที่');
    expect(googleCalls).toBe(0);
  });
});

test.describe('survey map — Google Maps (stubbed), surveyor on desktop', () => {
  test.use({ storageState: storage.admin, permissions: [] });

  test('GPS not allowed: no crash, map picker adds the point', async ({
    page,
  }) => {
    await stubGoogleMaps(page);
    await page.goto(`/projects/${seeded.project.id}/map`);
    await page.getByRole('button', { name: 'เพิ่มจุดติดตั้ง' }).click();
    const add = page.getByRole('dialog', { name: 'เพิ่มจุดติดตั้ง CCTV' });
    await add.getByRole('button', { name: /ใช้ตำแหน่งปัจจุบัน/ }).click();
    await expect(add.getByRole('alert')).toContainText(
      'ไม่สามารถรับตำแหน่งปัจจุบันได้',
    );
    await add
      .getByRole('alert')
      .getByRole('button', { name: 'เลือกตำแหน่งบนแผนที่' })
      .click();
    await tapGoogleMap(page, 13.7571, 100.5031);
    await page.getByRole('button', { name: 'ยืนยันตำแหน่ง' }).click();
    const form = page.getByRole('dialog', { name: 'เพิ่มกล้อง' });
    await form.getByLabel('รหัสกล้อง').fill('DESK-01');
    await pickCamera(form);
    await form.getByRole('button', { name: 'บันทึก' }).click();
    await expect(page.getByText('✓ บันทึก DESK-01 สำเร็จ')).toBeVisible();
    await expect(googleMarker(page, 'DESK-01')).toBeVisible();
  });
});

test.describe('survey map — responsive', () => {
  test.use({
    storageState: storage.admin,
    permissions: ['geolocation'],
    geolocation: { latitude: 13.7563, longitude: 100.5018, accuracy: 4 },
  });

  for (const [width, height] of [
    [360, 740],
    [375, 667],
    [390, 844],
    [430, 932],
    [1280, 800],
    [1280, 720],
  ] as const) {
    test(`${width}×${height}: map fills the screen, controls reachable`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await stubGoogleMaps(page);
      await page.goto(`/projects/${seeded.project.id}/map`);
      await expect(googleMarker(page, 'CAM-01')).toBeVisible();
      const box = (await page
        .locator('[data-map-engine="google"]')
        .boundingBox())!;
      expect(box.height).toBeGreaterThan(300);
      const doc = await page.evaluate(() => ({
        w: document.documentElement.scrollWidth,
        h: document.documentElement.scrollHeight,
      }));
      expect(doc.w).toBeLessThanOrEqual(width);
      expect(doc.h).toBeLessThanOrEqual(height);
      for (const name of ['เพิ่มจุดติดตั้ง', 'ไปยังตำแหน่งปัจจุบัน']) {
        const b = (await page.getByRole('button', { name }).boundingBox())!;
        expect(b.height, name).toBeGreaterThanOrEqual(44);
        expect(b.y + b.height, name).toBeLessThanOrEqual(height);
        expect(b.x + b.width, name).toBeLessThanOrEqual(width);
      }
      // The form sheet fits and its save button is on screen.
      await page.getByRole('button', { name: 'เพิ่มจุดติดตั้ง' }).click();
      await page
        .getByRole('dialog', { name: 'เพิ่มจุดติดตั้ง CCTV' })
        .getByRole('button', { name: /ใช้ตำแหน่งปัจจุบัน/ })
        .click();
      const form = page.getByRole('dialog', { name: 'เพิ่มกล้อง' });
      const f = (await form.boundingBox())!;
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.y + f.height).toBeLessThanOrEqual(height + 1);
      const save = (await form
        .getByRole('button', { name: 'บันทึก' })
        .boundingBox())!;
      expect(save.y + save.height).toBeLessThanOrEqual(height);
    });
  }
});

test.describe('survey map — Google key referrer restriction', () => {
  test.use({ storageState: storage.viewer });

  test('the map page sends its origin (only) to Google; others stay same-origin', async ({
    page,
  }) => {
    await stubGoogleMaps(page);
    const map = await page.goto(`/projects/${seeded.project.id}/map`);
    expect(map?.headers()['referrer-policy']).toBe(
      'strict-origin-when-cross-origin',
    );
    const other = await page.goto(`/projects/${seeded.project.id}`);
    expect(other?.headers()['referrer-policy']).toBe('same-origin');
  });
});
