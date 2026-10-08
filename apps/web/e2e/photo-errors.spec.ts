import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Route,
} from '@playwright/test';
import { adminApi, MODELS, pickCamera, seedProject, storage } from './env';
import { googleMarker, stubGoogleMaps } from './google-maps-stub';

/**
 * Photo upload messages (C1–C3): every failure says why, starts with
 * "อัปโหลดรูปไม่สำเร็จ", is a red alert, and an old failure disappears once a
 * later upload succeeds. Failures are produced by answering the photo POST
 * in the browser exactly as the API would (status + JSON body).
 */

const PHOTO_POST = /\/api\/cameras\/[^/]+\/photos(\?|$)/;

/** A real PNG drawn by the browser (the app shrinks it before sending). */
async function image(page: Page, color = '#2563eb') {
  const b64 = await page.evaluate((color) => {
    const c = document.createElement('canvas');
    c.width = 800;
    c.height = 600;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 800, 600);
    return c.toDataURL('image/png').split(',')[1];
  }, color);
  return {
    name: 'site.png',
    mimeType: 'image/png',
    buffer: Buffer.from(b64, 'base64'),
  };
}

/** The next photo POST(s) fail like the API would; other requests pass. */
async function failPhotoPosts(
  page: Page,
  how: { status: number; message: string } | 'network',
) {
  const handler = async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    if (how === 'network') return route.abort('failed');
    return route.fulfill({
      status: how.status,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: how.status, message: how.message }),
    });
  };
  await page.route(PHOTO_POST, handler);
  return () => page.unroute(PHOTO_POST, handler);
}

const photoList = (page: Page) =>
  page.getByRole('list', { name: 'รูปหน้างานที่บันทึกแล้ว' });

let api: APIRequestContext;
let seeded: Awaited<ReturnType<typeof seedProject>>;

test.beforeAll(async () => {
  api = await adminApi();
  seeded = await seedProject(api, 'photo errors');
});

test.afterAll(async () => {
  await api.dispose();
});

test.describe('photo upload messages (camera page)', () => {
  test.use({ storageState: storage.surveyor });

  test('success: the photo appears, no failure message', async ({ page }) => {
    await page.goto(`/cameras/${seeded.camera!.id}`);
    const detail = page.getByTestId('camera-detail');
    await detail.getByLabel('เพิ่มรูป').setInputFiles(await image(page));
    await expect(photoList(page).locator('img')).toHaveCount(1);
    await expect(detail).toContainText('รูปหน้างาน (1)');
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  });

  for (const [name, how, text] of [
    [
      '413',
      { status: 413, message: 'photo must be at most 972800 bytes' },
      'ไฟล์ใหญ่เกินไป',
    ],
    [
      '415',
      {
        status: 415,
        message: 'photo must be image/jpeg, image/png or image/webp',
      },
      'ไม่รองรับชนิดไฟล์',
    ],
    ['401', { status: 401, message: 'unauthorized' }, 'กรุณาเข้าสู่ระบบใหม่'],
    [
      '500',
      { status: 500, message: 'Internal server error' },
      'Server มีปัญหา (500)',
    ],
    ['network error', 'network', 'เชื่อมต่อ Server ไม่สำเร็จ'],
  ] as const) {
    test(`${name}: "อัปโหลดรูปไม่สำเร็จ … ${text}"`, async ({ page }) => {
      await page.goto(`/cameras/${seeded.camera!.id}`);
      const detail = page.getByTestId('camera-detail');
      await expect(detail).toContainText(/รูปหน้างาน \(\d+\)/);
      const before = await photoList(page).locator('img').count();
      await failPhotoPosts(page, how);
      await detail.getByLabel('เพิ่มรูป').setInputFiles(await image(page));
      const alert = detail.getByRole('alert');
      await expect(alert).toHaveText(
        `อัปโหลดรูปไม่สำเร็จ 1 จาก 1 รูป: ${text}`,
      );
      // Red, not the neutral style; nothing was added.
      await expect(alert).toHaveClass(/bg-red-50/);
      await expect(photoList(page).locator('img')).toHaveCount(before);
      // Still signed in: a failed photo is not a logout.
      await expect(page).toHaveURL(new RegExp(`/cameras/${seeded.camera!.id}`));
    });
  }

  test('fail, then retry: the failure message goes away', async ({ page }) => {
    await page.goto(`/cameras/${seeded.camera!.id}`);
    const detail = page.getByTestId('camera-detail');
    await expect(detail).toContainText(/รูปหน้างาน \(\d+\)/);
    const before = await photoList(page).locator('img').count();
    const restore = await failPhotoPosts(page, {
      status: 500,
      message: 'Internal server error',
    });
    await detail.getByLabel('เพิ่มรูป').setInputFiles(await image(page));
    await expect(detail.getByRole('alert')).toContainText(
      'อัปโหลดรูปไม่สำเร็จ',
    );
    await restore();
    await detail
      .getByLabel('เพิ่มรูป')
      .setInputFiles(await image(page, '#16a34a'));
    await expect(photoList(page).locator('img')).toHaveCount(before + 1);
    await expect(detail.getByRole('alert')).toHaveCount(0);
  });
});

test.describe('new camera: photo failure, then retry (C3)', () => {
  test.use({ storageState: storage.surveyor });

  test('the camera page says why; it is cleared after a successful upload', async ({
    page,
  }) => {
    await page.goto(`/projects/${seeded.project.id}/cameras/new`);
    await page.getByLabel('รหัสกล้อง').fill('CCTV-RETRY');
    await page.getByLabel('ละติจูด (lat)').fill('15.1');
    await page.getByLabel('ลองจิจูด (lng)').fill('100.1');
    await pickCamera(page.getByRole('main'), MODELS.dahuaBullet);
    await page
      .getByLabel('+ เพิ่มรูป')
      .setInputFiles([await image(page), await image(page, '#dc2626')]);
    const restore = await failPhotoPosts(page, {
      status: 500,
      message: 'Internal server error',
    });
    await page.getByRole('button', { name: 'บันทึก', exact: true }).click();

    // The point is saved; the page says which photos failed and why.
    await expect(
      page.getByRole('heading', { name: 'CCTV-RETRY' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/photosFailed=2/);
    const old = page.getByRole('main').getByRole('alert').first();
    await expect(old).toContainText(
      'อัปโหลดรูปไม่สำเร็จ 2 จาก 2 รูป: Server มีปัญหา (500)',
    );
    await expect(old).toContainText('บันทึกจุดกล้องแล้ว');

    // Retry succeeds: the old failure is gone, also after a reload.
    await restore();
    const detail = page.getByTestId('camera-detail');
    await detail
      .getByLabel('เพิ่มรูป')
      .setInputFiles(await image(page, '#16a34a'));
    await expect(photoList(page).locator('img')).toHaveCount(1);
    await expect(page).toHaveURL(/\/cameras\/[^/?]+$/);
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    await page.reload();
    await expect(photoList(page).locator('img')).toHaveCount(1);
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  });
});

test.describe('survey map: success and failure toasts (C1)', () => {
  test.use({
    storageState: storage.surveyor,
    permissions: ['geolocation'],
    geolocation: { latitude: 15.2, longitude: 100.2, accuracy: 3 },
  });

  async function addPointWithPhoto(page: Page, label: string) {
    await page.getByRole('button', { name: 'เพิ่มจุดติดตั้ง' }).click();
    await page
      .getByRole('dialog', { name: 'เพิ่มจุดติดตั้ง CCTV' })
      .getByRole('button', { name: /ใช้ตำแหน่งปัจจุบัน/ })
      .click();
    const form = page.getByRole('dialog', { name: 'เพิ่มกล้อง' });
    await form.getByLabel('รหัสกล้อง').fill(label);
    await pickCamera(form);
    await form.getByLabel('+ เพิ่มรูป').setInputFiles(await image(page));
    await form.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(form).toBeHidden();
  }

  test('success is a status message; failure a red alert that says why', async ({
    page,
  }) => {
    await stubGoogleMaps(page);
    await page.goto(`/projects/${seeded.project.id}/map`);
    await expect(googleMarker(page, 'CAM-01')).toBeVisible();

    await addPointWithPhoto(page, 'MAP-OK');
    const ok = page.getByRole('status').filter({ hasText: 'MAP-OK' });
    await expect(ok).toHaveText('✓ บันทึก MAP-OK สำเร็จ (รูป 1)');
    await expect(ok).toHaveAttribute('data-tone', 'status');
    await expect(
      page.getByRole('alert').filter({ hasText: 'MAP-OK' }),
    ).toHaveCount(0);

    await failPhotoPosts(page, { status: 413, message: 'too large' });
    await addPointWithPhoto(page, 'MAP-FAIL');
    const bad = page.getByRole('alert').filter({ hasText: 'MAP-FAIL' });
    await expect(bad).toHaveAttribute('data-tone', 'error');
    await expect(bad).toHaveClass(/bg-red-600/);
    await expect(bad).toContainText(
      /^อัปโหลดรูปไม่สำเร็จ 1 จาก 1 รูป: ไฟล์ใหญ่เกินไป — บันทึกจุด MAP-FAIL แล้ว/,
    );
    // It stays until closed (not the 3.5 s of a normal message).
    await page.waitForTimeout(4000);
    await expect(bad).toBeVisible();
    await bad.getByRole('button', { name: 'ปิดข้อความ' }).click();
    await expect(bad).toBeHidden();
  });
});
