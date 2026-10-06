import { expect, test, type APIRequestContext } from '@playwright/test';
import { adminApi, seedProject, storage } from './env';

/**
 * Editing a camera sends only the fields the user changed: everything else
 * keeps its value in the database (never the form's default or formatting).
 */
test.describe('camera edit keeps untouched fields', () => {
  test.use({ storageState: storage.admin });

  let api: APIRequestContext;
  let cameraId: string;

  test.beforeEach(async () => {
    api = await adminApi();
    const seeded = await seedProject(api, 'camera edit');
    cameraId = seeded.camera!.id;
    // Values the form formats differently (seconds, 7+ decimals) or would
    // default (type, status, cameraCount) if it filled them in itself.
    const res = await api.patch(`/api/cameras/${cameraId}`, {
      data: {
        type: 'bullet',
        status: 'pending_design',
        location: { lat: 15.200829273552092, lng: 100.12359545735323 },
        gpsAccuracyM: 2.37,
        surveyedAt: '2026-10-05T02:39:21.456Z',
        purpose: 'walkway',
        cameraCount: 3,
        resolutionMp: 5,
        notes: 'หมายเหตุ  ',
      },
    });
    expect(res.status()).toBe(200);
  });

  test.afterEach(async () => {
    await api.dispose();
  });

  const read = async () =>
    (await (await api.get(`/api/cameras/${cameraId}`)).json()) as Record<
      string,
      unknown
    >;

  test('changing brand and model sends only those two', async ({ page }) => {
    const before = await read();
    await page.goto(`/cameras/${cameraId}/edit`);
    // A point without a model shows its camera as typed by hand.
    await page.locator('#brand').fill('TEST');
    await page.locator('#model').fill('TEST-M');

    const patch = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        r.url().endsWith(`/api/cameras/${cameraId}`),
    );
    await page.getByRole('button', { name: 'บันทึก' }).click();
    const res = await patch;
    expect(res.status()).toBe(200);
    expect(res.request().postDataJSON()).toEqual({
      brand: 'TEST',
      model: 'TEST-M',
    });

    const after = await read();
    // Every other field (location, GPS accuracy, surveyedAt, createdAt, …).
    expect(after).toEqual({
      ...before,
      brand: 'TEST',
      model: 'TEST-M',
      updatedAt: after.updatedAt,
    });
    expect(after.createdAt).toBe(before.createdAt);
    expect(Date.parse(after.updatedAt as string)).toBeGreaterThan(
      Date.parse(before.updatedAt as string),
    );

    // Back on the camera page, which shows what the database has.
    await expect(page).toHaveURL(new RegExp(`/cameras/${cameraId}$`));
    await expect(page.getByTestId('camera-detail')).toContainText('TEST-M');
  });

  test('saving without changes sends nothing', async ({ page }) => {
    const before = await read();
    let patched = false;
    page.on('request', (r) => {
      if (r.method() === 'PATCH') patched = true;
    });
    await page.goto(`/cameras/${cameraId}/edit`);
    await expect(page.locator('#brand')).toBeVisible();
    await page.getByRole('button', { name: 'บันทึก' }).click();
    await expect(page).toHaveURL(new RegExp(`/cameras/${cameraId}$`));
    expect(patched).toBe(false);
    expect(await read()).toEqual(before);
  });

  test('the form starts from the database, not a cached copy', async ({
    page,
  }) => {
    await page.goto(`/cameras/${cameraId}/edit`);
    await expect(page.getByLabel('รหัสกล้อง')).toHaveValue('CAM-01');
    // Changed elsewhere while this browser still has the old copy cached.
    const res = await api.patch(`/api/cameras/${cameraId}`, {
      data: { label: 'CAM-01-NEW', brand: 'ELSEWHERE' },
    });
    expect(res.status()).toBe(200);
    await page.getByRole('link', { name: 'ยกเลิก' }).click();
    await page
      .getByTestId('camera-detail')
      .getByRole('link', { name: 'แก้ไขข้อมูลกล้อง' })
      .click();
    await expect(page.getByLabel('รหัสกล้อง')).toHaveValue('CAM-01-NEW');
    await expect(page.locator('#brand')).toHaveValue('ELSEWHERE');
  });
});
