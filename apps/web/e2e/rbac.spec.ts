import { expect, test } from '@playwright/test';
import { adminApi, seedProject, storage } from './env';

let seeded: Awaited<ReturnType<typeof seedProject>>;

test.beforeAll(async () => {
  const api = await adminApi();
  seeded = await seedProject(api, 'rbac');
  await api.dispose();
});

test.describe('viewer (read-only)', () => {
  test.use({ storageState: storage.viewer });

  test('sees data but no create, edit or delete controls', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByText(seeded.project.name)).toBeVisible();
    await expect(
      page.getByRole('link', { name: '+ สร้างโปรเจกต์' }),
    ).toHaveCount(0);

    await page.getByText(seeded.project.name).click();
    await expect(
      page.getByRole('heading', { name: seeded.project.name }),
    ).toBeVisible();
    await expect(page.getByRole('list', { name: 'รายการกล้อง' })).toContainText(
      'CAM-01',
    );
    for (const name of ['แก้ไขโปรเจกต์', '+ เพิ่มกล้อง', 'แก้ไข']) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveCount(
        0,
      );
    }
    for (const name of ['ลบโปรเจกต์', 'ลบ']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(
        0,
      );
    }
    await page.getByRole('tab', { name: 'Site' }).click();
    await expect(page.getByRole('list', { name: 'รายการ Site' })).toContainText(
      'อาคาร A',
    );
    await expect(page.getByRole('link', { name: '+ เพิ่ม Site' })).toHaveCount(
      0,
    );
  });

  test('opening an edit URL directly shows "no permission"', async ({
    page,
  }) => {
    for (const url of [
      '/projects/new',
      `/projects/${seeded.project.id}/edit`,
      `/projects/${seeded.project.id}/sites/new`,
      `/projects/${seeded.project.id}/cameras/new`,
      `/sites/${seeded.site!.id}/edit`,
      `/cameras/${seeded.camera!.id}/edit`,
    ]) {
      await page.goto(url);
      await expect(
        page.getByRole('main').getByRole('alert'),
        url,
      ).toContainText('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
      await expect(page.getByRole('button', { name: 'บันทึก' })).toHaveCount(0);
    }
  });

  test('the API itself refuses a viewer, whatever the UI shows', async ({
    page,
  }) => {
    const r = page.request;
    const pid = seeded.project.id;
    expect(
      (await r.post('/api/projects', { data: { name: 'nope' } })).status(),
    ).toBe(403);
    expect(
      (
        await r.patch(`/api/projects/${pid}`, { data: { name: 'hacked' } })
      ).status(),
    ).toBe(403);
    expect((await r.delete(`/api/cameras/${seeded.camera!.id}`)).status()).toBe(
      403,
    );
    expect((await r.get('/api/users')).status()).toBe(403);
    const project = await (await r.get(`/api/projects/${pid}`)).json();
    expect(project.name).toBe(seeded.project.name);
  });
});
