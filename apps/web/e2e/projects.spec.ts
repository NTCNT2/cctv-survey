import { expect, test } from '@playwright/test';
import { adminApi, PREFIX, seedProject, storage } from './env';

test.describe('project list states', () => {
  test.use({ storageState: storage.viewer });

  test('loading, then empty state', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route('**/api/projects?*', async (route) => {
      await gate;
      await route.fulfill({ json: [] });
    });
    await page.goto('/projects');
    await expect(page.getByLabel('กำลังโหลด')).toBeVisible();
    release();
    await expect(page.getByText('ยังไม่มีโปรเจกต์')).toBeVisible();
    // A viewer is not offered a create button.
    await expect(
      page.getByRole('link', { name: '+ สร้างโปรเจกต์' }),
    ).toHaveCount(0);
  });

  test('server error shows a retry that recovers', async ({ page }) => {
    let fail = true;
    await page.route('**/api/projects?*', (route) =>
      fail
        ? route.fulfill({
            status: 500,
            json: { statusCode: 500, message: 'Internal server error' },
          })
        : route.continue(),
    );
    await page.goto('/projects');
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'เซิร์ฟเวอร์ขัดข้อง',
    );
    fail = false;
    await page.getByRole('button', { name: 'ลองใหม่' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'โปรเจกต์' })).toBeVisible();
  });
});

test.describe('admin: full create / edit / delete flow', () => {
  test.use({ storageState: storage.admin });

  test('project, site and camera', async ({ page }) => {
    const name = `${PREFIX} คลังสินค้าบางนา`;
    await page.goto('/projects');
    await page.getByRole('link', { name: '+ สร้างโปรเจกต์' }).first().click();

    // Client-side validation (shared zod schema) with Thai messages
    await page.getByLabel('ชื่อโปรเจกต์').fill(name);
    await page.getByLabel('ละติจูด (lat)').fill('200');
    await page.getByLabel('ลองจิจูด (lng)').fill('100.6');
    await page.getByRole('button', { name: 'บันทึก' }).click();
    await expect(page.getByText('ต้องไม่เกิน 90')).toBeVisible();
    await page.getByLabel('ละติจูด (lat)').fill('13.66');
    await page.getByLabel('ลูกค้า').fill('บริษัท ทดสอบ จำกัด');
    await page.getByRole('button', { name: 'บันทึก' }).click();

    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText('บริษัท ทดสอบ จำกัด')).toBeVisible();
    await expect(page.getByText('13.660000, 100.600000')).toBeVisible();

    // Edit: status + clear the customer
    await page.getByRole('link', { name: 'แก้ไขโปรเจกต์' }).click();
    await page.getByLabel('สถานะ').selectOption('surveying');
    await page.getByLabel('ลูกค้า').fill('');
    await page.getByRole('button', { name: 'บันทึก' }).click();
    await expect(page.getByText('กำลังสำรวจ')).toBeVisible();
    await expect(page.getByText('บริษัท ทดสอบ จำกัด')).toHaveCount(0);

    // Site
    await page.getByRole('tab', { name: 'Site' }).click();
    await expect(page.getByText('ยังไม่มี Site')).toBeVisible();
    await page.getByRole('link', { name: '+ เพิ่ม Site' }).first().click();
    await page.getByLabel('ชื่อ Site (อาคาร / พื้นที่ / ชั้น)').fill('อาคาร A');
    await page.getByRole('button', { name: 'บันทึก' }).click();
    await page.getByRole('tab', { name: 'Site' }).click();
    await expect(page.getByRole('list', { name: 'รายการ Site' })).toContainText(
      'อาคาร A',
    );

    // Camera: location is required; then attach it to the site
    await page.getByRole('tab', { name: 'กล้อง' }).click();
    await page.getByRole('link', { name: '+ เพิ่มกล้อง' }).first().click();
    await page.getByLabel('ชื่อ / รหัสกล้อง').fill('CAM-01');
    await page.getByRole('button', { name: 'บันทึก' }).click();
    await expect(page.getByText('กรุณากรอกข้อมูล').first()).toBeVisible();
    await page.getByLabel('Site').selectOption({ label: 'อาคาร A' });
    await page.getByLabel('ประเภท').selectOption('bullet');
    await page.getByLabel('ละติจูด (lat)').fill('13.6601');
    await page.getByLabel('ลองจิจูด (lng)').fill('100.6002');
    await page.getByLabel('ทิศทาง (องศา)').fill('360');
    await page.getByRole('button', { name: 'บันทึก' }).click();
    await expect(page.getByText('ต้องน้อยกว่า 360')).toBeVisible();
    await page.getByLabel('ทิศทาง (องศา)').fill('90');
    await page.getByLabel('PoE').selectOption('true');
    await page.getByRole('button', { name: 'บันทึก' }).click();

    const cameras = page.getByRole('list', { name: 'รายการกล้อง' });
    await expect(cameras).toContainText('CAM-01');
    await expect(cameras).toContainText('อาคาร A');
    await expect(cameras).toContainText('ทิศ 90°');

    // A second camera with the same label → API 409, shown on the form
    await page.getByRole('link', { name: '+ เพิ่มกล้อง' }).click();
    await page.getByLabel('ชื่อ / รหัสกล้อง').fill('CAM-01');
    await page.getByLabel('ละติจูด (lat)').fill('13.66');
    await page.getByLabel('ลองจิจูด (lng)').fill('100.6');
    await page.getByRole('button', { name: 'บันทึก' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'มีกล้องที่ใช้ชื่อนี้ในโปรเจกต์แล้ว',
    );
    await page.getByRole('link', { name: 'ยกเลิก' }).click();

    // Edit camera: rename, clear the bearing
    await cameras.getByRole('link', { name: 'แก้ไข' }).click();
    await page.getByLabel('ชื่อ / รหัสกล้อง').fill('CAM-01A');
    await page.getByLabel('ทิศทาง (องศา)').fill('');
    await page.getByRole('button', { name: 'บันทึก' }).click();
    await expect(cameras).toContainText('CAM-01A');
    await expect(cameras).not.toContainText('ทิศ 90°');

    // Deleting a project that still has children: explained, nothing deleted
    await page.getByRole('button', { name: 'ลบโปรเจกต์' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'ยืนยันการลบ' })
      .click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
      'ลบไม่ได้',
    );
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'ยกเลิก' })
      .click();

    // Delete camera, then site, then project
    await cameras.getByRole('button', { name: 'ลบ' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'ยืนยันการลบ' })
      .click();
    await expect(page.getByText('ยังไม่มีกล้องในโปรเจกต์นี้')).toBeVisible();

    await page.getByRole('tab', { name: 'Site' }).click();
    await page
      .getByRole('list', { name: 'รายการ Site' })
      .getByRole('button', { name: 'ลบ' })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'ยืนยันการลบ' })
      .click();
    await expect(page.getByText('ยังไม่มี Site')).toBeVisible();

    await page.getByRole('button', { name: 'ลบโปรเจกต์' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'ยืนยันการลบ' })
      .click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByText(name)).toHaveCount(0);
  });
});

test.describe('surveyor', () => {
  test.use({ storageState: storage.surveyor });

  test('can create and edit, but is not offered project delete', async ({
    page,
  }) => {
    await page.goto('/projects/new');
    await page.getByLabel('ชื่อโปรเจกต์').fill(`${PREFIX} งานผู้สำรวจ`);
    await page.getByRole('button', { name: 'บันทึก' }).click();
    await expect(
      page.getByRole('link', { name: 'แก้ไขโปรเจกต์' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'ลบโปรเจกต์' })).toHaveCount(
      0,
    );
    // …and the API agrees.
    const id = page.url().split('/').pop()!;
    expect((await page.request.delete(`/api/projects/${id}`)).status()).toBe(
      403,
    );
  });

  test('sees paging when there are more than 20 projects', async ({ page }) => {
    const api = await adminApi();
    for (let i = 0; i < 21; i++) await seedProject(api, `page-${i}`, false);
    await api.dispose();
    await page.goto('/projects');
    const list = page.getByRole('list', { name: 'รายการโปรเจกต์' });
    await expect(list.getByRole('listitem')).toHaveCount(20);
    await page.getByRole('button', { name: 'แสดงเพิ่มเติม' }).click();
    await expect(list.getByRole('listitem')).not.toHaveCount(20);
  });
});
