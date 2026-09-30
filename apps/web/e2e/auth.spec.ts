import { expect, test, type Page } from '@playwright/test';
import { adminApi, users, type E2EUser } from './env';

async function login(page: Page, u: E2EUser, path = '/login') {
  await page.goto(path);
  await page.getByLabel('ชื่อผู้ใช้').fill(u.username);
  await page
    .getByRole('textbox', { name: 'รหัสผ่าน', exact: true })
    .fill(u.password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
}

test.describe('sign-in and session', () => {
  test('a signed-out visitor is sent to the login page', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login\?next=%2Fprojects$/);
    await expect(
      page.getByRole('heading', { name: 'เข้าสู่ระบบ' }),
    ).toBeVisible();
  });

  test('wrong password shows a generic error and clears the password', async ({
    page,
  }) => {
    await login(page, {
      username: users.login.username,
      password: 'not-the-password-1',
    });
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    );
    await expect(
      page.getByRole('textbox', { name: 'รหัสผ่าน', exact: true }),
    ).toHaveValue('');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login sets an HttpOnly cookie scripts cannot read, and ignores off-site next', async ({
    page,
    context,
  }) => {
    await login(page, users.login, '/login?next=//evil.example/steal');
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByTestId('current-user')).toHaveText(
      users.login.username,
    );
    await expect(page.getByText('ผู้ดู')).toBeVisible();

    const cookie = (await context.cookies()).find(
      (c) => c.name === 'cctv_session',
    );
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: 'Strict',
      path: '/api',
    });
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      'cctv_session',
    );
    // No token anywhere in web storage either.
    expect(
      await page.evaluate(() =>
        JSON.stringify({ ...localStorage, ...sessionStorage }),
      ),
    ).toBe('{}');

    // Logout
    await page.getByTestId('current-user').click();
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page).toHaveURL(/\/login\?loggedOut=1$/);
    await expect(page.getByRole('status')).toHaveText('ออกจากระบบแล้ว');
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test('logout that fails on the network keeps the user signed in (L2)', async ({
    page,
  }) => {
    await login(page, users.login);
    await expect(page).toHaveURL(/\/projects$/);

    // Network failure: stay, explain, session still valid.
    await page.route('**/api/auth/logout', (route) => route.abort('failed'));
    await page.getByTestId('current-user').click();
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.locator('header').getByRole('alert')).toContainText(
      'ออกจากระบบไม่สำเร็จ',
    );
    await expect(page).toHaveURL(/\/projects$/);
    expect((await page.request.get('/api/auth/me')).status()).toBe(200);

    // 401 means there is no session any more: treat as signed out.
    await page.unroute('**/api/auth/logout');
    await page.route('**/api/auth/logout', (route) =>
      route.fulfill({
        status: 401,
        json: { statusCode: 401, message: 'Unauthorized' },
      }),
    );
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page).toHaveURL(/\/login\?loggedOut=1$/);
  });

  test('API responses through the web app are no-store and nosniff (L1)', async ({
    request,
  }) => {
    for (const path of ['/api/health', '/api/projects', '/api/auth/me']) {
      const res = await request.get(path);
      expect(res.headers()['cache-control'], path).toBe('no-store');
      expect(res.headers()['x-content-type-options'], path).toBe('nosniff');
    }
  });

  test('a session ended on the server sends the user back to login', async ({
    page,
  }) => {
    await login(page, users.victim);
    await expect(page).toHaveURL(/\/projects$/);

    const api = await adminApi();
    const list = await (await api.get('/api/users')).json();
    const victim = list.find(
      (u: { username: string }) => u.username === users.victim.username,
    );
    expect(
      (
        await api.patch(`/api/users/${victim.id}`, {
          data: { isActive: false },
        })
      ).status(),
    ).toBe(200);
    await api.dispose();

    await page.reload();
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole('heading', { name: 'เข้าสู่ระบบ' }),
    ).toBeVisible();
  });

  test('change password signs out everywhere and the new password works', async ({
    page,
  }) => {
    const newPassword = `${users.pwchange.password}-new`;
    await login(page, users.pwchange);
    await expect(page).toHaveURL(/\/projects$/);
    await page.getByTestId('current-user').click();
    await page.getByRole('link', { name: 'เปลี่ยนรหัสผ่าน' }).click();

    await page.getByLabel('รหัสผ่านปัจจุบัน').fill(users.pwchange.password);
    await page
      .getByRole('textbox', { name: 'รหัสผ่านใหม่', exact: true })
      .fill(newPassword);
    await page.getByLabel('ยืนยันรหัสผ่านใหม่').fill(`${newPassword}x`);
    await page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click();
    await expect(
      page.getByText('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน'),
    ).toBeVisible();

    await page.getByLabel('ยืนยันรหัสผ่านใหม่').fill(newPassword);
    await page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click();
    await expect(page).toHaveURL(/\/login\?changed=1$/);
    await expect(page.getByRole('status')).toContainText('เปลี่ยนรหัสผ่านแล้ว');

    await login(page, {
      username: users.pwchange.username,
      password: newPassword,
    });
    await expect(page).toHaveURL(/\/projects$/);
  });
});
