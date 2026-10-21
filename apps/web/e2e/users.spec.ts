import { randomBytes } from 'node:crypto';
import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { BASE_URL, storage, users } from './env';

/** e2e-web-* users are removed by scripts/web-e2e.sh at the end of the run. */
const newUsername = () => `e2e-web-u-${randomBytes(4).toString('hex')}`;

/**
 * No cookies: a context made inside a test otherwise starts with the test's
 * storage state, and a login that carries the admin's cookie replaces (and
 * so revokes) the admin's session — by design.
 */
const fresh = {
  baseURL: BASE_URL,
  storageState: { cookies: [], origins: [] },
};

/** Signs in through the API as that user; the context keeps the cookie. */
async function signIn(
  username: string,
  password: string,
): Promise<APIRequestContext> {
  const ctx = await request.newContext(fresh);
  const res = await ctx.post('/api/auth/login', {
    data: { username, password },
  });
  expect(res.status(), `login ${username}`).toBe(200);
  return ctx;
}

async function loginStatus(username: string, password: string) {
  const ctx = await request.newContext(fresh);
  const res = await ctx.post('/api/auth/login', {
    data: { username, password },
  });
  await ctx.dispose();
  return res.status();
}

const row = (page: Page, username: string) =>
  page.getByTestId(`user-${username}`);

/** Creates a user through the page; returns the generated password. */
async function createViaPage(
  page: Page,
  username: string,
  role: string,
  displayName = '',
): Promise<string> {
  await page.getByRole('button', { name: '+ เพิ่มผู้ใช้' }).click();
  await page.getByLabel('ชื่อผู้ใช้ (ใช้ตอนเข้าสู่ระบบ)').fill(username);
  if (displayName) await page.getByLabel('ชื่อที่แสดง').fill(displayName);
  await page.getByRole('radio', { name: role, exact: true }).check();
  await page.getByRole('button', { name: 'สุ่มรหัสผ่าน' }).click();
  await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
  await expect(page.getByText(`สร้างผู้ใช้ @${username} แล้ว`)).toBeVisible();
  await expect(page.getByTestId('credentials-username')).toHaveText(username);
  const password = (await page
    .getByTestId('credentials-password')
    .textContent())!;
  expect(password).toMatch(/^[a-zA-Z2-9]{16}$/);
  await page.getByRole('button', { name: 'เสร็จแล้ว' }).click();
  return password;
}

test.describe('admin', () => {
  test.use({ storageState: storage.admin });

  test('nav link, list, and own row is locked', async ({ page }) => {
    await page.goto('/projects');
    await page
      .getByRole('navigation', { name: 'เมนูหลัก' })
      .getByRole('link', { name: 'ผู้ใช้' })
      .click();
    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByRole('heading', { name: 'ผู้ใช้' })).toBeVisible();

    const me = row(page, users.admin.username);
    await expect(me).toContainText('คุณ');
    await expect(me).toContainText('ผู้ดูแลระบบ');
    await expect(me.getByRole('button', { name: /ปิดใช้งาน/ })).toHaveCount(0);
    await expect(
      me.getByRole('button', { name: /รีเซ็ตรหัสผ่าน/ }),
    ).toHaveCount(0);
    await expect(
      me.getByRole('link', { name: 'เปลี่ยนรหัสผ่านของคุณ' }),
    ).toBeVisible();

    await me.getByRole('button', { name: /^แก้ไข/ }).click();
    await expect(page.getByText('นี่คือบัญชีของคุณ')).toBeVisible();
    for (const r of await page.getByRole('radio').all()) {
      await expect(r).toBeDisabled();
    }
    await expect(
      page.getByRole('radio', { name: 'ผู้ดูแลระบบ', exact: true }),
    ).toBeChecked();
    await page.getByRole('button', { name: 'ยกเลิก' }).click();

    // Other users are listed with their role.
    await expect(row(page, users.surveyor.username)).toContainText('ผู้สำรวจ');
  });

  test('create with a generated password; validation and duplicates', async ({
    page,
  }) => {
    await page.goto('/users');
    // Client-side validation: nothing filled in.
    await page.getByRole('button', { name: '+ เพิ่มผู้ใช้' }).click();
    await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
    await expect(page.getByText('กรุณาเลือกสิทธิ์การใช้งาน')).toBeVisible();
    await expect(
      page.getByText('รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'ยกเลิก' }).click();

    const username = newUsername();
    const password = await createViaPage(
      page,
      username,
      'วิศวกร',
      'วิศวกร ทดสอบ',
    );
    const r = row(page, username);
    await expect(r).toContainText('วิศวกร ทดสอบ');
    await expect(r).toContainText('ยังไม่เคยเข้าใช้');

    // The new account works with the password that was shown.
    const ctx = await signIn(username, password);
    const me = await (await ctx.get('/api/auth/me')).json();
    expect(me.role).toBe('engineer');
    await ctx.dispose();

    // Same username again → Thai conflict message from the API.
    await page.getByRole('button', { name: '+ เพิ่มผู้ใช้' }).click();
    await page
      .getByLabel('ชื่อผู้ใช้ (ใช้ตอนเข้าสู่ระบบ)')
      .fill(username.toUpperCase());
    await page.getByRole('radio', { name: 'ผู้ดู', exact: true }).check();
    await page.getByRole('button', { name: 'สุ่มรหัสผ่าน' }).click();
    await page.getByRole('button', { name: 'สร้างผู้ใช้' }).click();
    await expect(
      page.getByText('มีชื่อผู้ใช้นี้แล้ว กรุณาใช้ชื่ออื่น'),
    ).toBeVisible();
  });

  test('role change applies at once to a signed-in user', async ({ page }) => {
    await page.goto('/users');
    const username = newUsername();
    const password = await createViaPage(page, username, 'ผู้ดู');
    const ctx = await signIn(username, password);
    expect(
      (await ctx.post('/api/projects', { data: { name: 'x' } })).status(),
    ).toBe(403);

    await row(page, username)
      .getByRole('button', { name: /^แก้ไข/ })
      .click();
    await page.getByRole('radio', { name: 'ผู้สำรวจ', exact: true }).check();
    await expect(page.getByText('สิทธิ์ใหม่มีผลทันที')).toBeVisible();
    await page.getByLabel('ชื่อที่แสดง').fill('เปลี่ยนเป็นผู้สำรวจ');
    await page.getByRole('button', { name: 'บันทึก' }).click();
    await expect(row(page, username)).toContainText('ผู้สำรวจ');
    await expect(row(page, username)).toContainText('เปลี่ยนเป็นผู้สำรวจ');

    // Same session, new role.
    const me = await (await ctx.get('/api/auth/me')).json();
    expect(me.role).toBe('surveyor');
    await ctx.dispose();
  });

  test('deactivate signs the user out and blocks login; reactivate', async ({
    page,
  }) => {
    await page.goto('/users');
    const username = newUsername();
    const password = await createViaPage(page, username, 'ผู้สำรวจ');
    const ctx = await signIn(username, password);

    // Cancel first: nothing happens.
    await row(page, username)
      .getByRole('button', { name: /^ปิดใช้งาน/ })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('ออกจากระบบทุกอุปกรณ์ทันที');
    await dialog.getByRole('button', { name: 'ยกเลิก' }).click();
    expect((await ctx.get('/api/auth/me')).status()).toBe(200);

    await row(page, username)
      .getByRole('button', { name: /^ปิดใช้งาน/ })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'ปิดใช้งาน', exact: true })
      .click();
    await expect(row(page, username)).toHaveCount(0); // left the active tab
    expect((await ctx.get('/api/auth/me')).status()).toBe(401);
    expect(await loginStatus(username, password)).toBe(401);
    await ctx.dispose();

    await page.getByRole('tab', { name: /ปิดใช้งาน/ }).click();
    const r = row(page, username);
    await expect(r).toContainText('ปิดใช้งาน');
    await r.getByRole('button', { name: /^เปิดใช้งาน/ }).click();
    await expect(r).toHaveCount(0);
    expect(await loginStatus(username, password)).toBe(200);
  });

  test('reset password signs the user out; new password works', async ({
    page,
  }) => {
    await page.goto('/users');
    const username = newUsername();
    const oldPassword = await createViaPage(page, username, 'ผู้สำรวจ');
    const ctx = await signIn(username, oldPassword);

    await row(page, username)
      .getByRole('button', { name: /^รีเซ็ตรหัสผ่าน/ })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'ออกจากระบบทุกอุปกรณ์ทันที' }),
    ).toBeVisible();
    // The username itself is refused before anything is sent.
    await page.getByLabel('รหัสผ่านใหม่').fill(username);
    await page
      .getByRole('button', { name: 'รีเซ็ตรหัสผ่าน', exact: true })
      .click();
    await expect(
      page.getByText('รหัสผ่านต้องไม่เหมือนชื่อผู้ใช้'),
    ).toBeVisible();
    expect((await ctx.get('/api/auth/me')).status()).toBe(200);

    await page.getByRole('button', { name: 'สุ่มรหัสผ่าน' }).click();
    await page
      .getByRole('button', { name: 'รีเซ็ตรหัสผ่าน', exact: true })
      .click();
    await expect(
      page.getByText(`รีเซ็ตรหัสผ่าน @${username} แล้ว`),
    ).toBeVisible();
    const newPassword = (await page
      .getByTestId('credentials-password')
      .textContent())!;
    expect(newPassword).not.toBe(oldPassword);

    expect((await ctx.get('/api/auth/me')).status()).toBe(401);
    await ctx.dispose();
    expect(await loginStatus(username, oldPassword)).toBe(401);
    expect(await loginStatus(username, newPassword)).toBe(200);
  });
});

for (const role of ['surveyor', 'viewer'] as const) {
  test.describe(`${role} (no user management)`, () => {
    test.use({ storageState: storage[role] });

    test('no link, and the page says "no permission"', async ({ page }) => {
      await page.goto('/projects');
      await expect(
        page
          .getByRole('navigation', { name: 'เมนูหลัก' })
          .getByText('ผู้ใช้', { exact: true }),
      ).toHaveCount(0);
      await page.getByTestId('current-user').click();
      await expect(
        page.getByRole('link', { name: 'จัดการผู้ใช้' }),
      ).toHaveCount(0);

      await page.goto('/users');
      await expect(
        page.getByText('คุณไม่มีสิทธิ์เข้าถึงหน้านี้', { exact: false }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: '+ เพิ่มผู้ใช้' }),
      ).toHaveCount(0);
    });
  });
}
