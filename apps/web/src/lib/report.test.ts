import type { CameraPoint } from '@cctv/shared';
import { describe, expect, it } from 'vitest';
import {
  camerasCsv,
  csvCell,
  followUp,
  reportFileName,
  reportSummary,
  toCsv,
} from './report';

const base: CameraPoint = {
  id: '00000000-0000-4000-8000-000000000001',
  projectId: '00000000-0000-4000-8000-0000000000aa',
  label: 'CCTV-001',
  type: 'dome',
  status: 'surveyed',
  location: { lat: 13.75, lng: 100.5 },
  cameraCount: 1,
  photoCount: 0,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

/** Every main survey item answered. */
const complete: Partial<CameraPoint> = {
  mountHeightM: 4,
  bearingDeg: 90,
  viewDistanceM: 30,
  purpose: 'entrance',
  structureType: 'wall',
  cabinetDistanceM: 20,
  powerAvailable: true,
  networkAvailable: true,
  fiberAvailable: false,
};

const cam = (over: Partial<CameraPoint>): CameraPoint => ({
  ...base,
  ...over,
});

describe('followUp', () => {
  it('names why a point still needs work', () => {
    expect(followUp(cam({ status: 'pending_survey', ...complete }))).toBe(
      'pending',
    );
    expect(followUp(cam({ status: 'issue', ...complete }))).toBe('issue');
    expect(followUp(cam({}))).toBe('incomplete');
    expect(followUp(cam(complete))).toBeUndefined();
  });
});

describe('reportSummary', () => {
  const cameras = [
    cam({
      ...complete,
      siteId: 's1',
      brand: 'HIK',
      model: 'D1',
      resolutionMp: 2,
      cameraCount: 2,
      cableLengthM: 40,
      photoCount: 3,
    }),
    cam({
      id: 'b',
      label: 'CCTV-002',
      siteId: 's1',
      brand: 'HIK',
      model: 'D1',
      resolutionMp: 2,
      cableLengthM: 15.5,
    }),
    cam({ id: 'c', label: 'CCTV-003', type: 'ptz', status: 'issue' }),
  ];
  const s = reportSummary(cameras, { s1: 'อาคาร A' });

  it('counts points, cameras, statuses, cable and completeness', () => {
    expect(s.points).toBe(3);
    expect(s.cameras).toBe(4);
    expect(s.byStatus.surveyed).toBe(2);
    expect(s.byStatus.issue).toBe(1);
    expect(s.byStatus.installed).toBe(0);
    expect(s.cable).toEqual({ total: 55.5, missing: 1 });
    expect(s.complete).toBe(1);
    expect(s.photos).toBe(3);
  });

  it('groups by site, type and MP, most cameras first', () => {
    expect(s.bySite.map((r) => [r.label, r.points, r.cameras])).toEqual([
      ['อาคาร A', 2, 3],
      ['ไม่ระบุ Site', 1, 1],
    ]);
    expect(s.byType.map((r) => [r.key, r.cameras])).toEqual([
      ['dome', 3],
      ['ptz', 1],
    ]);
    expect(s.byResolution.map((r) => [r.label, r.cameras])).toEqual([
      ['2 MP', 3],
      ['ไม่ระบุ', 1],
    ]);
  });

  it('lists equipment by brand, model, type and MP', () => {
    expect(s.equipment.map((r) => [r.label, r.cameras])).toEqual([
      ['HIK D1 (Dome · 2 MP)', 3],
      ['ไม่ระบุ (PTZ)', 1],
    ]);
  });
});

describe('CSV', () => {
  it('quotes separators and neutralises formulas in text only', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+66 81')).toBe("'+66 81");
    expect(csvCell('@sum')).toBe("'@sum");
    expect(csvCell(-12.5)).toBe('-12.5');
    expect(csvCell(undefined)).toBe('');
  });

  it('starts with a BOM and uses CRLF', () => {
    expect(
      toCsv([
        ['ก', 1],
        ['ข', 2],
      ]),
    ).toBe('﻿ก,1\r\nข,2\r\n');
  });

  it('writes one row per point with every survey item', () => {
    const csv = camerasCsv(
      [
        cam({
          ...complete,
          siteId: 's1',
          notes: 'ติดตั้ง, ด้านหน้า',
          brand: '=cmd',
        }),
      ],
      { s1: 'อาคาร A' },
    );
    const [header, row, end] = csv.slice(1).split('\r\n');
    expect(end).toBe('');
    expect(header).toContain('1. ความสูงติดตั้งกล้อง');
    expect(header).toContain('15. สถานะ Survey');
    expect(header.split(',')).toHaveLength(
      row.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)!.length,
    );
    expect(row).toContain('CCTV-001,อาคาร A,สำรวจแล้ว');
    expect(row).toContain("'=cmd");
    expect(row).toContain('"ติดตั้ง, ด้านหน้า"');
    expect(row).toContain('4 ม.');
    expect(row).toContain('9/9');
  });
});

describe('reportFileName', () => {
  it('removes characters file systems reject', () => {
    expect(
      reportFileName('เทศบาล: "A/B"', new Date('2026-10-21T05:00:00Z')),
    ).toBe('เทศบาล A B - จุดกล้อง 2026-10-21.csv');
  });
});
