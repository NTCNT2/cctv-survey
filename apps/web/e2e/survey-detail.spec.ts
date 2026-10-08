import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { adminApi, seedProject, storage } from './env';

/**
 * Survey detail (15 items): Camera Detail → รายละเอียด Survey → fill in →
 * บันทึก Survey → back on the camera with the new n/9 → reopen: the values
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

  test('main data with quick picks, save part, finish later, optional extra', async ({
    page,
  }) => {
    const id = seeded.camera!.id;
    await page.goto(`/cameras/${id}`);
    const detail = page.getByTestId('camera-detail');
    // A new point: none of the 9 main items yet (status does not count).
    await expect(
      detail.getByRole('link', { name: 'รายละเอียด Survey (0/9)' }),
    ).toBeVisible();
    await expect(detail.getByTestId('survey-missing')).toContainText(
      'ข้อมูลหลักยังขาด 9 รายการ: ความสูงติดตั้งกล้อง, ทิศทางกล้อง, ระยะมองโดยประมาณ และอีก 6 รายการ',
    );

    // 1) Open the survey form: main data first, the optional part folded.
    await detail.getByRole('link', { name: /รายละเอียด Survey/ }).click();
    await expect(page).toHaveURL(new RegExp(`/cameras/${id}/survey$`));
    await expect(
      page.getByRole('heading', { name: 'รายละเอียด Survey: CAM-01' }),
    ).toBeVisible();
    await expect(progress(page)).toContainText(
      'ข้อมูลหลัก 0/9 · ยังขาด 9 รายการ',
    );
    await expect(progress(page)).toContainText(
      'ข้อมูลเพิ่มเติม 0/4 (ไม่บังคับ)',
    );
    await expect(
      page.getByLabel('11. ตำแหน่งตู้ Control / จุดรวมสาย'),
    ).toBeHidden();

    // 2) A value out of range: shown at the field, nothing is saved.
    await page.getByLabel('2. ทิศทางกล้อง (°)').fill('400');
    await page.getByRole('button', { name: 'บันทึก Survey' }).click();
    await expect(page.getByText('ต้องน้อยกว่า 360')).toBeVisible();
    await expect(page).toHaveURL(/\/survey$/);

    // 3) Quick picks fill the number fields (which stay editable).
    const heights = group(page, 'ความสูงติดตั้ง: ค่าที่ใช้บ่อย');
    await heights.getByRole('button', { name: '5 ม.' }).click();
    await expect(page.getByLabel('1. ความสูงติดตั้งกล้อง (ม.)')).toHaveValue(
      '5',
    );
    await expect(heights.getByRole('button', { name: '5 ม.' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await group(page, 'ทิศทางกล้อง: ค่าที่ใช้บ่อย')
      .getByRole('button', { name: 'ทิศตะวันออก (90°)' })
      .click();
    await expect(page.getByLabel('2. ทิศทางกล้อง (°)')).toHaveValue('90');
    await expect(
      page.getByText('ทิศตะวันออก · 0–359 จากทิศเหนือ'),
    ).toBeVisible();
    await expect(progress(page)).toContainText('ข้อมูลหลัก 2/9');

    // 4) Saving with most of it missing is fine; only changes are sent.
    const first = nextPatch(page);
    await page.getByRole('button', { name: 'บันทึก Survey' }).click();
    expect(await first).toEqual({ mountHeightM: 5, bearingDeg: 90 });
    await expect(page).toHaveURL(new RegExp(`/cameras/${id}$`));
    await expect(
      detail.getByRole('link', { name: 'รายละเอียด Survey (2/9)' }),
    ).toBeVisible();

    // 5) Later: the saved values are still there; finish the main data.
    await detail.getByRole('link', { name: /รายละเอียด Survey/ }).click();
    await expect(page.getByLabel('1. ความสูงติดตั้งกล้อง (ม.)')).toHaveValue(
      '5',
    );
    await expect(page.getByLabel('2. ทิศทางกล้อง (°)')).toHaveValue('90');

    // A missing item jumps to its field.
    await progress(page).getByText('ข้อมูลหลักที่ยังขาด').click();
    await progress(page)
      .getByRole('button', { name: '4. วัตถุประสงค์การติดตั้ง' })
      .click();
    await expect(
      group(page, '4. วัตถุประสงค์การติดตั้ง').getByRole('radio').first(),
    ).toBeFocused();

    await group(page, 'ระยะมอง: ค่าที่ใช้บ่อย')
      .getByRole('button', { name: '30 ม.' })
      .click();
    await group(page, '4. วัตถุประสงค์การติดตั้ง').getByText('ทางเข้า').click();
    // On a building there is no pole: item 6 needs no input.
    await group(page, '5. โครงสร้างติดตั้ง').getByText('อาคาร').click();
    await expect(page.getByLabel('6. ความสูงเสา (ม.)')).toHaveCount(0);
    await expect(page.getByText('6. ความสูงเสา — ไม่ต้องกรอก')).toBeVisible();

    // Cable length: a suggestion from the cabinet distance, never filled in
    // by itself; taken with a tap, then still editable.
    const cable = page.getByLabel('8. ความยาวสายโดยประมาณ (ม.)');
    await page.getByLabel('7. ระยะถึงตู้ Control (ม.)').fill('25');
    await expect(cable).toHaveValue('');
    await page.getByRole('button', { name: 'ใช้ค่าประมาณ 35 ม.' }).click();
    await expect(cable).toHaveValue('35');
    await expect(page.getByTestId('cable-suggestion')).toContainText(
      'ใช้ค่าประมาณจากระยะถึงตู้ — แก้ได้ตามหน้างานจริง',
    );
    await cable.fill('40');
    await expect(
      page.getByRole('button', { name: 'ใช้ค่าประมาณ 35 ม.' }),
    ).toBeVisible();

    await group(page, '9. ระบบไฟเลี้ยง')
      .getByText('มี', { exact: true })
      .click();
    await group(page, 'PoE').getByText('ใช้', { exact: true }).click();
    await group(page, 'Network').getByText('มี', { exact: true }).click();
    // Network alone is not item 10 yet: Fiber still to answer.
    await expect(progress(page)).toContainText('ข้อมูลหลัก 8/9');
    await group(page, 'Fiber').getByText('ไม่มี', { exact: true }).click();
    await expect(progress(page)).toContainText('ข้อมูลหลักครบแล้ว 9/9');
    await expect(
      page.getByRole('progressbar', { name: 'ข้อมูลหลักของ Survey' }),
    ).toHaveAttribute('aria-valuenow', '9');

    // 6) Main data complete with nothing optional: saved, 9/9.
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
    });
    await expect(
      detail.getByRole('link', { name: 'รายละเอียด Survey (9/9)' }),
    ).toBeVisible();
    await expect(detail.getByTestId('survey-missing')).toHaveCount(0);

    // 7) The optional part (11–14): unfold, fill, save.
    await detail.getByRole('link', { name: /รายละเอียด Survey/ }).click();
    await page.getByText('ข้อมูลเพิ่มเติม (ไม่บังคับ)').click();
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
    await expect(progress(page)).toContainText('ข้อมูลเพิ่มเติม 4/4');
    await expect(progress(page)).toContainText('ข้อมูลหลักครบแล้ว 9/9');
    const third = nextPatch(page);
    await page.getByRole('button', { name: 'บันทึก Survey' }).click();
    expect(await third).toEqual({
      cabinetLocation: 'ใต้บันไดอาคาร B',
      siteConditions: 'ต้นไม้บังบางส่วน',
      notes: 'ติดใต้ชายคา',
      siteIssues: 'ขอเพิ่มไฟส่องสว่าง',
    });
    await expect(page).toHaveURL(new RegExp(`/cameras/${id}$`));

    // 8) Stored: after a reload, in the list on the camera and in the API.
    await page.reload();
    await expect(
      detail.getByRole('link', { name: 'รายละเอียด Survey (9/9)' }),
    ).toBeVisible();
    await detail.getByRole('button', { name: 'ดูข้อมูลสำรวจ' }).click();
    await expect(detail).toContainText('ใต้บันไดอาคาร B');
    await expect(detail).toContainText('Network มี · Fiber ไม่มี');
    await expect(detail).toContainText('มีไฟ · ใช้ PoE');
    await expect(detail).toContainText('ไม่ใช้เสา');
    const stored = await (await api.get(`/api/cameras/${id}`)).json();
    expect(stored).toMatchObject({
      mountHeightM: 5,
      bearingDeg: 90,
      cableLengthM: 40,
      structureType: 'building',
      siteIssues: 'ขอเพิ่มไฟส่องสว่าง',
      status: 'surveyed',
      // Untouched by the survey form.
      label: 'CAM-01',
      type: 'dome',
      photoCount: 0,
    });

    // 9) Reopen: answers selected again, the optional part open (it has
    // data); clear one main item → 8/9.
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
    await expect(progress(page)).toContainText('ข้อมูลหลัก 8/9');
    const fourth = nextPatch(page);
    await page.getByRole('button', { name: 'บันทึก Survey' }).click();
    expect(await fourth).toEqual({ powerAvailable: null });
    await expect(
      detail.getByRole('link', { name: 'รายละเอียด Survey (8/9)' }),
    ).toBeVisible();
    await expect(detail.getByTestId('survey-missing')).toContainText(
      'ข้อมูลหลักยังขาด 1 รายการ: ระบบไฟเลี้ยง',
    );

    // 10) Nothing changed: no request, straight back.
    await detail.getByRole('link', { name: /รายละเอียด Survey/ }).click();
    let patched = false;
    page.on('request', (r) => {
      if (r.method() === 'PATCH') patched = true;
    });
    await page.getByRole('button', { name: 'บันทึก Survey' }).click();
    await expect(page).toHaveURL(new RegExp(`/cameras/${id}$`));
    expect(patched).toBe(false);

    // 11) Status: preset, changeable (not cleared), not part of the count.
    await detail.getByRole('link', { name: /รายละเอียด Survey/ }).click();
    const status = group(page, '15. สถานะ Survey');
    await expect(status.getByLabel('สำรวจแล้ว')).toBeChecked();
    await expect(
      page.getByRole('button', { name: 'ล้างค่า 15. สถานะ Survey' }),
    ).toHaveCount(0);
    await status.getByText('มีปัญหา').click();
    await expect(status.getByLabel('มีปัญหา')).toBeChecked();
    await expect(progress(page)).toContainText('ข้อมูลหลัก 8/9');
    await page.getByRole('link', { name: 'ยกเลิก' }).click();
    await expect(
      detail.getByRole('link', { name: 'รายละเอียด Survey (8/9)' }),
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
