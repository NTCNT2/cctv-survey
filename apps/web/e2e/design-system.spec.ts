import { expect, test } from '@playwright/test';
import { storage } from './env';

test.describe('design system components', () => {
  test.use({ storageState: storage.viewer });

  test('bottom sheet: opens, traps focus, closes with Escape / backdrop and returns focus', async ({
    page,
  }) => {
    await page.goto('/design-system');
    const fab = page.getByRole('button', { name: 'เพิ่มจุด' });
    const sheet = page.getByRole('dialog', { name: 'เพิ่มจุดติดตั้ง CCTV' });

    await fab.click();
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('เลือกวิธีระบุตำแหน่งของจุด');
    // Focus is inside the modal dialog.
    expect(
      await sheet.evaluate((d) => d.contains(document.activeElement)),
    ).toBe(true);

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(fab).toBeFocused();

    // A click on the backdrop (outside the panel) closes it too.
    await fab.click();
    await expect(sheet).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(sheet).toBeHidden();

    // Choosing an option closes the sheet and reports the choice.
    await fab.click();
    await sheet.getByRole('button', { name: /ใช้ตำแหน่งปัจจุบัน/ }).click();
    await expect(sheet).toBeHidden();
    await expect(
      page.getByText('เลือกแล้ว: ใช้ตำแหน่งปัจจุบัน', { exact: true }),
    ).toBeVisible();
  });

  test('tabs move with arrow keys; segmented control reports its state', async ({
    page,
  }) => {
    await page.goto('/design-system');
    const tabs = page.getByRole('tablist', { name: 'ตัวอย่างแท็บ' });
    await tabs.getByRole('tab', { name: /กล้อง/ }).click();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.getByRole('tab', { name: /พื้นที่/ })).toBeFocused();
    await expect(tabs.getByRole('tab', { name: /พื้นที่/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(tabs.getByRole('tab', { name: 'รูปหน้างาน' })).toBeFocused();

    const group = page.getByRole('group', { name: 'ชั้นแผนที่' });
    const sat = group.getByRole('button', { name: 'ดาวเทียม' });
    await expect(sat).toHaveAttribute('aria-pressed', 'false');
    await sat.click();
    await expect(sat).toHaveAttribute('aria-pressed', 'true');
  });
});
