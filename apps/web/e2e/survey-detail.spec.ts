import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { adminApi, seedProject, storage } from './env';

/**
 * Survey detail (15 items): Camera Detail → รายละเอียด Survey → fill in →
 * บันทึก Survey → back on the camera with the new n/15 → reopen: the values
 * are still there. Saving part of it is allowed (the rest later).
 */

let api: APIRequestContext;
let seeded: Awaited<ReturnType<typeof seedProject>>;

test.beforeAll(async () => {
  api = await adminApi();
  seeded = await seedProject(api, 'survey detail');
});

test.afterAll(async () => {
  await api.dispose();
});

const group = (page: Page, name: string) =>
  page.getByRole('group', { name, exact: true });
const progress = (page: Page) => page.getByTestId('survey-progress');
/** The next PATCH of the camera (not of a photo), as sent. */
const nextPatch = (page: Page) =>
  page
    .waitForRequest(
      (r) =>
        r.method() === 'PATCH' &&
        /\/api\/cameras\/[^/]+$/.test(new URL(r.url()).pathname),
    )
    .then((r) => r.postDataJSON() as Record<string, unknown>);

test.describe('survey detail (surveyor)', () => {
  test.use({ storageState: storage.surveyor });

  test('fill in part, save, come back, finish: 1/15 → 3/15 → 15/15', async ({
    page,
  }) => {
    const id = seeded.camera!.id;
    await page.goto(`/cameras/${id}`);
    const detail = page.getByTestId('camera-detail');
    // A new point: only the survey status (สำรวจแล้ว) is filled.
    await expect(
      detail.getByRole('link', { name: 'รายละเอียด Survey (1/15)' }),
    ).toBeVisible();
    await expect(detail.getByTestId('survey-missing')).toContainText(
      'Survey ยังขาด 14 รายการ: ความสูงติดตั้งกล้อง, ทิศทางกล้อง, ระยะมองโดยประมาณ และอีก 11 รายการ',
    );

    // 1) Open the survey form.
    await detail.getByRole('link', { name: /รายละเอียด Survey/ }).click();
    await expect(page).toHaveURL(new RegExp(`/cameras/${id}/survey$`));
    await expect(
      page.getByRole('heading', { name: 'รายละเอียด Survey: CAM-01' }),
    ).toBeVisible();
    await expect(progress(page)).toContainText(
      'กรอกแล้ว 1/15 · ยังขาด 14 รายการ',
    );

    // 2) A value out of range: shown at the field, nothing is saved.
    await page.getByLabel('2. ทิศทางกล้อง (°)').fill('400');
    await page.getByRole('button', { name: 'บันทึก Survey' }).click();
    await expect(page.getByText('ต้องน้อยกว่า 360')).toBeVisible();
    await expect(page).toHaveURL(/\/survey$/);

    // 3) Part of it now: the progress follows as it is typed.
    await page.getByLabel('1. ความสูงติดตั้งกล้อง (ม.)').fill('4,5');
    await page.getByLabel('2. ทิศทางกล้อง (°)').fill('90');
    await expect(progress(page)).toContainText('กรอกแล้ว 3/15');
    const first = nextPatch(page);
    await page.getByRole('button', { name: 'บันทึก Survey' }).click();
    // Only what was changed is sent.
    expect(await first).toEqual({ mountHeightM: 4.5, bearingDeg: 90 });
    await expect(page).toHaveURL(new RegExp(`/cameras/${id}$`));
    await expect(
      detail.getByRole('link', { name: 'รายละเอียด Survey (3/15)' }),
    ).toBeVisible();

    // 4) Later: the saved values are still there; fill in the rest.
    await detail.getByRole('link', { name: /รายละเอียด Survey/ }).click();
    await expect(page.getByLabel('1. ความสูงติดตั้งกล้อง (ม.)')).toHaveValue(
      '4.5',
    );
    await expect(page.getByLabel('2. ทิศทางกล้อง (°)')).toHaveValue('90');

    // A missing item jumps to its field.
    await progress(page).getByText('รายการที่ยังขาด').click();
    await progress(page)
      .getByRole('button', { name: '11. ตำแหน่งตู้ Control / จุดรวมสาย' })
      .click();
    await expect(
      page.getByLabel('11. ตำแหน่งตู้ Control / จุดรวมสาย'),
    ).toBeFocused();

    await page.getByLabel('3. ระยะมองโดยประมาณ (ม.)').fill('30');
    await page
      .getByLabel('4. วัตถุประสงค์การติดตั้ง')
      .selectOption({ label: 'ทางเข้า' });
    // On a building there is no pole: item 6 needs no input.
    await group(page, '5. โครงสร้างติดตั้ง').getByText('อาคาร').click();
    await expect(page.getByLabel('6. ความสูงเสา (ม.)')).toHaveCount(0);
    await expect(page.getByText('6. ความสูงเสา — ไม่ต้องกรอก')).toBeVisible();
    await page.getByLabel('7. ระยะถึงตู้ Control (ม.)').fill('25');
    await page.getByLabel('8. ความยาวสายโดยประมาณ (ม.)').fill('40');
    await group(page, '9. ระบบไฟเลี้ยง')
      .getByText('มี', { exact: true })
      .click();
    await group(page, 'PoE').getByText('ใช้', { exact: true }).click();
    await group(page, 'Network').getByText('มี', { exact: true }).click();
    // Network alone is not item 10 yet: Fiber still to answer.
    await expect(progress(page)).toContainText('กรอกแล้ว 10/15');
    await group(page, 'Fiber').getByText('ไม่มี', { exact: true }).click();
    await page
      .getByLabel('11. ตำแหน่งตู้ Control / จุดรวมสาย')
      .fill('ใต้บันไดอาคาร B');
    await page
      .getByLabel('12. สภาพพื้นที่ติดตั้ง / อุปสรรค')
      .fill('ต้นไม้บังบางส่วน');
    await page.getByLabel('13. หมายเหตุหน้างาน').fill('ติดใต้ชายคา');
    await page
      .getByLabel('14. ความต้องการเพิ่มเติม / ปัญหาที่พบ')
      .fill('ขอเพิ่มไฟส่องสว่าง');
    await expect(progress(page)).toContainText('กรอกครบแล้ว 15/15');
    await expect(
      page.getByRole('progressbar', { name: 'ความครบถ้วนของ Survey' }),
    ).toHaveAttribute('aria-valuenow', '15');

    const second = nextPatch(page);
    await page.getByRole('button', { name: 'บันทึก Survey' }).click();
    expect(await second).toEqual({
      viewDistanceM: 30,
      purpose: 'entrance',
      structureType: 'building',
      cabinetDistanceM: 25,
      cableLengthM: 40,
      powerAvailable: true,
      poe: true,
      networkAvailable: true,
      fiberAvailable: false,
      cabinetLocation: 'ใต้บันไดอาคาร B',
      siteConditions: 'ต้นไม้บังบางส่วน',
      notes: 'ติดใต้ชายคา',
      siteIssues: 'ขอเพิ่มไฟส่องสว่าง',
    });
    await expect(
      detail.getByRole('link', { name: 'รายละเอียด Survey (15/15)' }),
    ).toBeVisible();
    await expect(detail.getByTestId('survey-missing')).toHaveCount(0);

    // 5) Stored: after a reload, in the list on the camera and in the API.
    await page.reload();
    await expect(
      detail.getByRole('link', { name: 'รายละเอียด Survey (15/15)' }),
    ).toBeVisible();
    await detail.getByRole('button', { name: 'ดูข้อมูลสำรวจ' }).click();
    await expect(detail).toContainText('ใต้บันไดอาคาร B');
    await expect(detail).toContainText('Network มี · Fiber ไม่มี');
    await expect(detail).toContainText('มีไฟ · ใช้ PoE');
    await expect(detail).toContainText('ไม่ใช้เสา');
    const stored = await (await api.get(`/api/cameras/${id}`)).json();
    expect(stored).toMatchObject({
      mountHeightM: 4.5,
      bearingDeg: 90,
      structureType: 'building',
      siteIssues: 'ขอเพิ่มไฟส่องสว่าง',
      status: 'surveyed',
      // Untouched by the survey form.
      label: 'CAM-01',
      type: 'dome',
      photoCount: 0,
    });

    // 6) Reopen: every answer is selected again; clear one → 14/15.
    await detail.getByRole('link', { name: /รายละเอียด Survey/ }).click();
    await expect(
      group(page, 'Fiber').getByLabel('ไม่มี', { exact: true }),
    ).toBeChecked();
    await expect(
      group(page, '5. โครงสร้างติดตั้ง').getByLabel('อาคาร'),
    ).toBeChecked();
    await expect(page.getByLabel('13. หมายเหตุหน้างาน')).toHaveValue(
      'ติดใต้ชายคา',
    );
    await page.getByRole('button', { name: 'ล้างค่า 9. ระบบไฟเลี้ยง' }).click();
    await expect(progress(page)).toContainText('กรอกแล้ว 14/15');
    const third = nextPatch(page);
    await page.getByRole('button', { name: 'บันทึก Survey' }).click();
    expect(await third).toEqual({ powerAvailable: null });
    await expect(
      detail.getByRole('link', { name: 'รายละเอียด Survey (14/15)' }),
    ).toBeVisible();
    await expect(detail.getByTestId('survey-missing')).toContainText(
      'Survey ยังขาด 1 รายการ: ระบบไฟเลี้ยง',
    );

    // 7) Nothing changed: no request, straight back.
    await detail.getByRole('link', { name: /รายละเอียด Survey/ }).click();
    let patched = false;
    page.on('request', (r) => {
      if (r.method() === 'PATCH') patched = true;
    });
    await page.getByRole('button', { name: 'บันทึก Survey' }).click();
    await expect(page).toHaveURL(new RegExp(`/cameras/${id}$`));
    expect(patched).toBe(false);

    // 8) "รอสำรวจ" is not a finished survey.
    await detail.getByRole('link', { name: /รายละเอียด Survey/ }).click();
    await page.getByLabel('15. สถานะ Survey').selectOption('pending_survey');
    await expect(progress(page)).toContainText('กรอกแล้ว 13/15');
    await page.getByRole('link', { name: 'ยกเลิก' }).click();
    await expect(
      detail.getByRole('link', { name: 'รายละเอียด Survey (14/15)' }),
    ).toBeVisible();
  });
});

test.describe('survey detail (viewer)', () => {
  test.use({ storageState: storage.viewer });

  test('sees the survey list but cannot open the form', async ({ page }) => {
    const id = seeded.camera!.id;
    await page.goto(`/cameras/${id}`);
    const detail = page.getByTestId('camera-detail');
    const toggle = detail.getByRole('button', { name: /รายละเอียด Survey/ });
    await expect(toggle).toBeVisible();
    await expect(
      detail.getByRole('link', { name: /รายละเอียด Survey/ }),
    ).toHaveCount(0);
    await toggle.click();
    await expect(detail).toContainText('1. ความสูงติดตั้งกล้อง');
    await page.goto(`/cameras/${id}/survey`);
    await expect(page.getByLabel('1. ความสูงติดตั้งกล้อง (ม.)')).toHaveCount(0);
    await expect(page.getByText(/ไม่มีสิทธิ์/)).toBeVisible();
  });
});
