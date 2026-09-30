import { expect, test, type Page } from '@playwright/test';
import { adminApi, seedProject, storage } from './env';

/** Runs on the emulated phones (Pixel 7, iPhone 13 — Chromium). */

let seeded: Awaited<ReturnType<typeof seedProject>>;

test.beforeAll(async ({}, info) => {
  const api = await adminApi();
  // Runs once per device project, so the name must be unique per device.
  seeded = await seedProject(
    api,
    `${info.project.name} ชื่อโปรเจกต์ยาวมากเพื่อทดสอบการตัดบรรทัดบนหน้าจอขนาดเล็ก`,
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
    await expect(page.getByText(seeded.project.name)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await info.attach('projects', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    await page.getByText(seeded.project.name).tap();
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
});
