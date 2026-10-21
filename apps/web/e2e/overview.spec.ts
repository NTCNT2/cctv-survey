import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { adminApi, seedProject, storage } from './env';
import { googleMarker, stubGoogleMaps } from './google-maps-stub';

let seeded: Awaited<ReturnType<typeof seedProject>>;
/**
 * beforeAll runs once per worker, and every worker sees every project on the
 * overview pages: names and labels carry a per-worker tag.
 */
const tag = randomBytes(3).toString('hex');
const OV1 = `OV1-${tag}`;
const OV2 = `OV2-${tag}`;
/** Id of the flagged extra point (OV1 is complete, OV2 has an issue). */
let ov2: string;

test.beforeAll(async () => {
  const api = await adminApi();
  // seedProject adds CAM-01 (site อาคาร A, no survey detail: incomplete).
  seeded = await seedProject(api, `overview ${tag}`);
  const post = async (data: object) => {
    const r = await api.post('/api/cameras', {
      data: {
        projectId: seeded.project.id,
        type: 'bullet',
        location: { lat: 13.7565, lng: 100.502 },
        ...data,
      },
    });
    if (!r.ok()) throw new Error(`seed camera: ${r.status()}`);
    return ((await r.json()) as { id: string }).id;
  };
  await post({
    label: OV1,
    brand: 'ACME',
    model: 'B-200',
    resolutionMp: 4,
    cameraCount: 2,
    mountHeightM: 4,
    bearingDeg: 90,
    viewDistanceM: 30,
    purpose: 'entrance',
    structureType: 'wall',
    cabinetDistanceM: 20,
    cableLengthM: 30,
    powerAvailable: true,
    networkType: 'fiber',
    notes: 'หน้า, ประตู "A"',
  });
  ov2 = await post({ label: OV2, status: 'issue', siteId: seeded.site!.id });
  await api.dispose();
});

test.describe('viewer', () => {
  test.use({ storageState: storage.viewer });

  test('the app opens on the dashboard; the three sections are live', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'แดชบอร์ด' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'เมนูหลัก' });
    for (const name of ['แดชบอร์ด', 'แผนที่สำรวจ', 'รายงาน']) {
      await expect(nav.getByRole('link', { name })).toBeVisible();
    }
    await expect(nav.getByText('เร็วๆ นี้')).toHaveCount(0);
  });

  test('dashboard: counts, 30-day chart, follow-ups and recent points', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    const stats = page.getByRole('region', { name: 'สรุปภาพรวม' });
    await expect(stats.getByText('—')).toHaveCount(0);
    await expect(stats).toContainText('จุดกล้อง');
    await expect(stats).toContainText(/กล้องรวม \d+ ตัว/);

    const bars = page.getByTestId('day-bar');
    await expect(bars).toHaveCount(30);
    // Today's column holds at least the three points seeded above.
    const today = Number(await bars.last().getAttribute('data-points'));
    expect(today).toBeGreaterThanOrEqual(3);
    await bars.last().hover();
    await expect(page.getByRole('tooltip')).toContainText(`${today} จุด`);
    await page.getByText('ดูเป็นตาราง').click();
    await expect(page.getByRole('table').first()).toBeVisible();

    const follow = page.getByRole('list', { name: 'จุดที่ต้องตามต่อ' });
    // Flagged first; the complete point is not listed.
    const ov2Row = follow.getByRole('link', { name: new RegExp(OV2) });
    await expect(ov2Row).toContainText('มีปัญหา');
    await expect(ov2Row).toContainText(seeded.project.name);
    // Viewers open the detail, not the survey form.
    await expect(ov2Row).toHaveAttribute('href', `/cameras/${ov2}`);
    await expect(
      follow.getByRole('link', { name: new RegExp(OV1) }),
    ).toHaveCount(0);

    const recent = page.getByRole('list', { name: 'จุดกล้องที่แก้ไขล่าสุด' });
    await expect(
      recent.getByRole('link', { name: new RegExp(OV2) }),
    ).toBeVisible();
  });

  test('survey map: every project, filters, detail links to the project map', async ({
    page,
  }) => {
    await stubGoogleMaps(page);
    await page.goto('/dashboard');
    await page
      .getByRole('navigation', { name: 'เมนูหลัก' })
      .getByRole('link', { name: 'แผนที่สำรวจ' })
      .click();
    await expect(page).toHaveURL(/\/map$/);
    await expect(page.locator('[data-map-engine="google"]')).toBeVisible();
    await expect(googleMarker(page, OV1)).toBeVisible();

    await page
      .getByRole('combobox', { name: 'โครงการ' })
      .selectOption(seeded.project.id);
    await expect(page.getByRole('status').first()).toHaveText(
      'แสดง 3 จุด จาก 1 โครงการ',
    );
    await page.getByRole('combobox', { name: 'สถานะ' }).selectOption('issue');
    await expect(page.getByRole('status').first()).toHaveText(
      'แสดง 1 จุด จาก 1 โครงการ',
    );
    await expect(googleMarker(page, OV1)).toHaveCount(0);
    await page.getByRole('combobox', { name: 'สถานะ' }).selectOption('');

    // The three seeded points overlap at this zoom: choose from the stack.
    await googleMarker(page, OV1).click();
    await page
      .getByRole('dialog', { name: /จุดที่อยู่ใกล้กัน/ })
      .getByRole('button', { name: new RegExp(OV1) })
      .click();
    const sheet = page.getByRole('dialog', { name: OV1 });
    await expect(sheet).toContainText(seeded.project.name);
    await expect(
      sheet.getByRole('link', { name: 'เปิดในแผนที่โครงการ' }),
    ).toHaveAttribute('href', `/projects/${seeded.project.id}/map`);
    // Read-only here: no photo upload or edit.
    await expect(sheet.getByRole('button', { name: /เพิ่มรูป/ })).toHaveCount(
      0,
    );
    await sheet.getByRole('button', { name: 'ปิด' }).click();

    await page.getByRole('button', { name: /รายการจุด \(3\)/ }).click();
    const list = page.getByRole('dialog', { name: 'จุดกล้อง (3)' });
    await expect(list.getByRole('button')).toContainText(['CAM-01', OV1, OV2]);
  });

  test('report: summary, equipment, table, filters, CSV and print', async ({
    page,
  }) => {
    await page.goto('/reports');
    await page
      .getByRole('list', { name: 'โครงการสำหรับรายงาน' })
      .getByRole('link', { name: new RegExp(seeded.project.name) })
      .click();
    await expect(page).toHaveURL(`/reports/${seeded.project.id}`);
    await expect(
      page.getByRole('heading', {
        name: `รายงานสำรวจ: ${seeded.project.name}`,
      }),
    ).toBeVisible();

    const summary = page.getByRole('region', { name: 'สรุปผลสำรวจ' });
    await expect(summary).toContainText('จุดกล้อง3');
    await expect(summary).toContainText('จำนวนกล้อง4');
    await expect(summary).toContainText('ข้อมูลหลักครบ1/3');
    await expect(summary).toContainText('ยังไม่ระบุ 2 จุด');
    await expect(page.getByText('ACME B-200 (Bullet · 4 MP)')).toBeVisible();

    const table = page.getByRole('table', { name: 'ตารางจุดกล้อง' });
    await expect(table.getByRole('row')).toHaveCount(4);
    await expect(
      table.getByRole('row', { name: new RegExp(OV1) }),
    ).toContainText('9/9');
    await expect(table.getByRole('row', { name: /CAM-01/ })).toContainText(
      'ความสูงติดตั้งกล้อง',
    );

    // CSV of every point.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'ดาวน์โหลด CSV (3 จุด)' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /- จุดกล้อง \d{4}-\d{2}-\d{2}\.csv$/,
    );
    const csv = await readFile((await download.path())!, 'utf8');
    expect(csv.startsWith('﻿รหัสจุด,Site,สถานะ')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines.find((l) => l.startsWith(`${OV1},`))).toContain(
      '"หน้า, ประตู ""A"""',
    );
    expect(lines.find((l) => l.startsWith(`${OV2},`))).toContain(
      `${OV2},อาคาร A,มีปัญหา`,
    );

    // Filter → summary, table and CSV follow it.
    await page.getByRole('combobox', { name: 'สถานะ' }).selectOption('issue');
    await expect(page.getByText('กรองแล้ว: 1 จาก 3 จุด')).toBeVisible();
    await expect(table.getByRole('row')).toHaveCount(2);
    await expect(
      page.getByRole('button', { name: 'ดาวน์โหลด CSV (1 จุด)' }),
    ).toBeVisible();
    await page.getByRole('combobox', { name: 'สถานะ' }).selectOption('');

    // Per-point detail: all 15 items.
    await page.getByLabel('รายละเอียดรายจุด (15 รายการ)').check();
    const details = page.getByRole('region', { name: 'รายละเอียดรายจุด' });
    await expect(details.getByText('15. สถานะ Survey')).toHaveCount(3);

    // Print: no app chrome, a print header instead of the screen header.
    await page.emulateMedia({ media: 'print' });
    await expect(
      page.getByRole('navigation', { name: 'เมนูหลัก' }),
    ).toBeHidden();
    await expect(
      page.getByRole('heading', { name: 'รายงานสำรวจกล้อง CCTV' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'พิมพ์ / บันทึก PDF' }),
    ).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
  });
});

test.describe('surveyor', () => {
  test.use({ storageState: storage.surveyor });

  test('a follow-up opens the survey form', async ({ page }) => {
    await page.goto('/dashboard');
    const row = page
      .getByRole('list', { name: 'จุดที่ต้องตามต่อ' })
      .getByRole('link', { name: new RegExp(OV2) });
    await expect(row).toHaveAttribute('href', `/cameras/${ov2}/survey`);
  });
});
