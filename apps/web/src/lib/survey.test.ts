import { describe, expect, it } from 'vitest';
import {
  compassName,
  nextPointCode,
  suggestCableLength,
  surveyItems,
  surveyProgress,
  type SurveyValues,
} from './survey';

describe('nextPointCode', () => {
  it('starts at CCTV-001', () => {
    expect(nextPointCode([])).toBe('CCTV-001');
    expect(nextPointCode(['CAM-01', 'หน้าเทศบาล'])).toBe('CCTV-001');
  });

  it('continues after the highest number, ignoring gaps and case', () => {
    expect(nextPointCode(['CCTV-001', 'cctv-007', 'CCTV-003'])).toBe(
      'CCTV-008',
    );
    expect(nextPointCode(['CCTV-999'])).toBe('CCTV-1000');
  });
});

describe('surveyItems / surveyProgress', () => {
  const full: SurveyValues = {
    mountHeightM: 4.5,
    bearingDeg: 90,
    viewDistanceM: 30,
    purpose: 'entrance',
    structureType: 'new_pole',
    poleHeightM: 6,
    cabinetDistanceM: 25,
    cableLengthM: 40,
    powerAvailable: true,
    poe: true,
    networkAvailable: true,
    fiberAvailable: false,
    cabinetLocation: 'ใต้บันได',
    siteConditions: 'ต้นไม้บัง',
    notes: 'ติดใต้ชายคา',
    siteIssues: 'ขอเพิ่มไฟส่องสว่าง',
    status: 'surveyed',
  };

  it('has the 15 items in order, numbered 1–15', () => {
    const items = surveyItems({});
    expect(items.map((i) => i.no)).toEqual(
      Array.from({ length: 15 }, (_, i) => i + 1),
    );
    expect(items.map((i) => i.label)).toEqual([
      'ความสูงติดตั้งกล้อง',
      'ทิศทางกล้อง',
      'ระยะมองโดยประมาณ',
      'วัตถุประสงค์การติดตั้ง',
      'โครงสร้างติดตั้ง',
      'ความสูงเสา',
      'ระยะจากจุดกล้องถึงตู้ Control',
      'ความยาวสายโดยประมาณ',
      'ระบบไฟเลี้ยง',
      'ระบบ Network / Fiber',
      'ตำแหน่งตู้ Control / จุดรวมสาย',
      'สภาพพื้นที่ติดตั้ง / อุปสรรค',
      'หมายเหตุหน้างาน',
      'ความต้องการเพิ่มเติม / ปัญหาที่พบ',
      'สถานะ Survey',
    ]);
  });

  it('groups: 9 main, 4 extra (11–14), cable length auto, status', () => {
    const by = (g: string) =>
      surveyItems({})
        .filter((i) => i.group === g)
        .map((i) => i.no);
    expect(by('main')).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10]);
    expect(by('extra')).toEqual([11, 12, 13, 14]);
    expect(by('auto')).toEqual([8]);
    expect(by('status')).toEqual([15]);
  });

  it('nothing filled: main 0/9, all 9 missing; extra 0/4', () => {
    const p = surveyProgress({});
    expect([p.done, p.total, p.missing.length]).toEqual([0, 9, 9]);
    expect([p.extraDone, p.extraTotal]).toEqual([0, 4]);
  });

  it('the progress counts only main items', () => {
    // Status, cable length and the optional texts do not move it.
    const p = surveyProgress({
      status: 'surveyed',
      cableLengthM: 40,
      notes: 'x',
      siteIssues: 'y',
    });
    expect([p.done, p.total]).toEqual([0, 9]);
    expect(p.extraDone).toBe(2);
    expect(p.missing.every((i) => i.group === 'main')).toBe(true);
  });

  it('main complete without any optional item: 9/9, nothing missing', () => {
    const p = surveyProgress({
      ...full,
      cableLengthM: undefined,
      cabinetLocation: undefined,
      siteConditions: undefined,
      notes: undefined,
      siteIssues: undefined,
    });
    expect([p.done, p.total, p.missing]).toEqual([9, 9, []]);
    expect(p.extraDone).toBe(0);
  });

  it('everything filled: 9/9 and 4/4, values as shown on the camera', () => {
    const p = surveyProgress(full);
    expect([p.done, p.total, p.missing]).toEqual([9, 9, []]);
    expect([p.extraDone, p.extraTotal]).toEqual([4, 4]);
    const v = Object.fromEntries(p.items.map((i) => [i.no, i.value]));
    expect(v).toMatchObject({
      1: '4.5 ม.',
      2: '90°',
      4: 'ทางเข้า',
      5: 'เสาใหม่',
      6: '6 ม.',
      9: 'มีไฟ · ใช้ PoE',
      10: 'Network มี · Fiber ไม่มี',
      15: 'สำรวจแล้ว',
    });
  });

  it('0 is a value; false is an answer', () => {
    const p = surveyProgress({ bearingDeg: 0, powerAvailable: false });
    expect(p.items[1]).toMatchObject({ done: true, value: '0°' });
    expect(p.items[8]).toMatchObject({ done: true, value: 'ไม่มีไฟ' });
  });

  it('pole height is not needed on a building or wall', () => {
    expect(surveyItems({ structureType: 'building' })[5]).toMatchObject({
      done: true,
      value: 'ไม่ใช้เสา',
    });
    expect(surveyItems({ structureType: 'existing_pole' })[5].done).toBe(false);
    expect(surveyItems({})[5].done).toBe(false);
  });

  it('Network / Fiber needs both answers', () => {
    expect(surveyItems({ networkAvailable: true })[9]).toMatchObject({
      done: false,
      field: 'fiberAvailable',
    });
    expect(surveyItems({})[9].field).toBe('networkAvailable');
  });

  it('blank text is not filled; "รอสำรวจ" is not a finished survey', () => {
    const p = surveyProgress({ notes: '   ', cabinetLocation: '' });
    expect(p.extraDone).toBe(0);
    expect(surveyItems({ status: 'pending_survey' })[14].done).toBe(false);
    expect(surveyItems({ status: 'issue' })[14].value).toBe('มีปัญหา');
  });

  it('missing main items point at their form fields', () => {
    const { missing } = surveyProgress({ ...full, purpose: undefined });
    expect(missing).toEqual([
      expect.objectContaining({ no: 4, field: 'purpose' }),
    ]);
  });
});

describe('suggestCableLength', () => {
  it('cabinet distance × 1.2 + 5 m, rounded up', () => {
    expect(suggestCableLength(25)).toBe(35);
    expect(suggestCableLength(12.3)).toBe(20);
    expect(suggestCableLength(0.5)).toBe(6);
  });

  it('no distance, no suggestion; never above the API limit', () => {
    expect(suggestCableLength(undefined)).toBeUndefined();
    expect(suggestCableLength(0)).toBeUndefined();
    expect(suggestCableLength(Number.NaN)).toBeUndefined();
    expect(suggestCableLength(5000)).toBe(1000);
  });
});

describe('compassName', () => {
  it('nearest of the 8 directions', () => {
    expect(compassName(0)).toBe('ทิศเหนือ');
    expect(compassName(100)).toBe('ทิศตะวันออก');
    expect(compassName(337)).toBe('ทิศตะวันตกเฉียงเหนือ');
    expect(compassName(359)).toBe('ทิศเหนือ');
    expect(compassName(undefined)).toBeUndefined();
  });
});
