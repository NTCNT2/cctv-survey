import { expect, test } from '@playwright/test';
import { adminApi, blockTiles, mapMarker, seedProject, storage } from './env';

let seeded: Awaited<ReturnType<typeof seedProject>>;

test.beforeAll(async () => {
  const api = await adminApi();
  seeded = await seedProject(api, 'map');
  await api.dispose();
});

test.describe('survey map — viewer', () => {
  test.use({
    storageState: storage.viewer,
    permissions: ['geolocation'],
    geolocation: { latitude: 13.7563, longitude: 100.5018, accuracy: 4 },
  });

  test('sees markers and the point list, but cannot add points', async ({
    page,
  }) => {
    await blockTiles(page);
    await page.goto(`/projects/${seeded.project.id}`);
    await page.getByRole('link', { name: 'แผนที่สำรวจ' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/projects/${seeded.project.id}/map$`),
    );
    await expect(mapMarker(page, 'CAM-01')).toBeVisible();
    await expect(page.getByTestId('gps-status')).toContainText('GPS พร้อม');
    await expect(page.getByRole('button', { name: 'เพิ่มจุด' })).toHaveCount(0);

    // Desktop: points list as a side panel; picking a point opens its detail.
    await page.getByRole('button', { name: /จุดกล้อง \(1\)/ }).click();
    const list = page.getByRole('dialog', { name: 'จุดกล้อง (1)' });
    await list.getByRole('button', { name: /CAM-01/ }).click();
    const detail = page.getByRole('dialog', { name: 'CAM-01' });
    await expect(detail).toContainText('อาคาร A');
    await expect(detail.getByRole('link', { name: 'แก้ไข' })).toHaveCount(0);

    // Search within the project's points.
    await page.keyboard.press('Escape');
    await page.getByLabel('ค้นหาจุดกล้องในโครงการ').fill('cam');
    await page
      .getByRole('list', { name: 'ผลการค้นหา' })
      .getByRole('button', { name: /CAM-01/ })
      .click();
    await expect(page.getByRole('dialog', { name: 'CAM-01' })).toBeVisible();
  });
});

test.describe('survey map — location permission denied', () => {
  test.use({ storageState: storage.admin, permissions: [] });

  test('explains that location is not allowed; picking on the map still works', async ({
    page,
  }) => {
    await blockTiles(page);
    await page.goto(`/projects/${seeded.project.id}/map`);
    await expect(page.getByTestId('gps-status')).toContainText(
      'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง',
    );
    await page.getByRole('button', { name: 'เพิ่มจุด' }).click();
    const add = page.getByRole('dialog', { name: 'เพิ่มจุดติดตั้ง CCTV' });
    await expect(
      add.getByRole('button', { name: /ใช้ตำแหน่งปัจจุบัน/ }),
    ).toBeDisabled();
    await add.getByRole('button', { name: /เลือกตำแหน่งบนแผนที่/ }).click();
    await page.getByRole('button', { name: 'ยืนยันตำแหน่ง' }).click();
    await expect(
      page.getByRole('dialog', { name: 'จุดกล้องใหม่' }),
    ).toBeVisible();
  });
});
