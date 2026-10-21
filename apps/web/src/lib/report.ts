import {
  CAMERA_STATUSES,
  DASHBOARD_TIME_ZONE,
  type CameraPoint,
  type CameraStatus,
  type CameraType,
} from '@cctv/shared';
import {
  CAMERA_STATUS_LABELS,
  CAMERA_TYPE_LABELS,
  formatDateTime,
} from './labels';
import { surveyItems, surveyProgress } from './survey';

/**
 * Why a point still needs someone: not surveyed yet, flagged, or main survey
 * items missing (the "ข้อมูลหลัก n/9" of the survey form). Undefined: done.
 */
export type FollowUp = 'pending' | 'issue' | 'incomplete';

export function followUp(c: CameraPoint): FollowUp | undefined {
  if (c.status === 'pending_survey') return 'pending';
  if (c.status === 'issue') return 'issue';
  const p = surveyProgress(c);
  return p.done < p.total ? 'incomplete' : undefined;
}

export const FOLLOW_UP_LABELS: Record<FollowUp, string> = {
  pending: 'รอสำรวจ',
  issue: 'มีปัญหา',
  incomplete: 'ข้อมูลหลักยังไม่ครบ',
};

/** Counted rows, largest first; `key` keeps identity, `label` is shown. */
export interface CountRow {
  key: string;
  label: string;
  points: number;
  cameras: number;
}

function tally(
  cameras: CameraPoint[],
  keyOf: (c: CameraPoint) => { key: string; label: string },
): CountRow[] {
  const rows = new Map<string, CountRow>();
  for (const c of cameras) {
    const { key, label } = keyOf(c);
    const r = rows.get(key) ?? { key, label, points: 0, cameras: 0 };
    r.points += 1;
    r.cameras += c.cameraCount;
    rows.set(key, r);
  }
  return [...rows.values()].sort(
    (a, b) => b.cameras - a.cameras || a.label.localeCompare(b.label, 'th'),
  );
}

const NONE = 'ไม่ระบุ';

/** Everything the report page shows above the point table. */
export function reportSummary(
  cameras: CameraPoint[],
  siteNames: Record<string, string> = {},
) {
  const byStatus = Object.fromEntries(
    CAMERA_STATUSES.map((s) => [s, 0]),
  ) as Record<CameraStatus, number>;
  let cable = 0;
  let cableMissing = 0;
  let complete = 0;
  let photos = 0;
  for (const c of cameras) {
    byStatus[c.status] += 1;
    if (c.cableLengthM === undefined) cableMissing += 1;
    else cable += c.cableLengthM;
    const p = surveyProgress(c);
    if (p.done === p.total) complete += 1;
    photos += c.photoCount;
  }
  return {
    points: cameras.length,
    cameras: cameras.reduce((n, c) => n + c.cameraCount, 0),
    byStatus,
    complete,
    photos,
    /** Sum of the points' estimated cable lengths (m), and how many lack one. */
    cable: { total: cable, missing: cableMissing },
    bySite: tally(cameras, (c) =>
      c.siteId
        ? { key: c.siteId, label: siteNames[c.siteId] ?? NONE }
        : { key: '', label: 'ไม่ระบุ Site' },
    ),
    byType: tally(cameras, (c) => ({
      key: c.type,
      label: CAMERA_TYPE_LABELS[c.type as CameraType],
    })),
    byResolution: tally(cameras, (c) =>
      c.resolutionMp === undefined
        ? { key: '', label: NONE }
        : { key: String(c.resolutionMp), label: `${c.resolutionMp} MP` },
    ),
    /** Bill of materials: brand + model (+ type and MP), counted in cameras. */
    equipment: tally(cameras, (c) => {
      const name = [c.brand, c.model].filter(Boolean).join(' ') || NONE;
      const spec = [
        CAMERA_TYPE_LABELS[c.type as CameraType],
        c.resolutionMp === undefined ? undefined : `${c.resolutionMp} MP`,
      ]
        .filter(Boolean)
        .join(' · ');
      return {
        key: `${c.brand ?? ''}\u0000${c.model ?? ''}\u0000${c.type}\u0000${c.resolutionMp ?? ''}`,
        label: `${name} (${spec})`,
      };
    }),
  };
}

export type ReportSummary = ReturnType<typeof reportSummary>;

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

type Cell = string | number | undefined;

/**
 * One CSV field. Text that a spreadsheet would run as a formula (= + - @ and
 * control characters at the start) gets a leading apostrophe; numbers are
 * written as they are.
 */
export function csvCell(v: Cell): string {
  if (v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 BOM + CRLF: Excel then opens Thai text correctly. */
export function toCsv(rows: Cell[][]): string {
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** The point table of a project, one row per point, all 15 survey items. */
export function camerasCsv(
  cameras: CameraPoint[],
  siteNames: Record<string, string> = {},
): string {
  const itemLabels = surveyItems({}).map((i) => `${i.no}. ${i.label}`);
  const header: Cell[] = [
    'รหัสจุด',
    'Site',
    'สถานะ',
    'ประเภทกล้อง',
    'ยี่ห้อ',
    'รุ่น',
    'MP',
    'เลนส์ (มม.)',
    'จำนวนกล้อง',
    'ละติจูด',
    'ลองจิจูด',
    'ความแม่นยำ GPS (ม.)',
    'ชื่อที่ติดตั้ง',
    ...itemLabels,
    'ข้อมูลหลักครบ',
    'รูปหน้างาน',
    'ผู้สำรวจ',
    'วันเวลาที่สำรวจ',
  ];
  const rows = cameras.map((c): Cell[] => {
    const p = surveyProgress(c);
    return [
      c.label,
      c.siteId ? siteNames[c.siteId] : undefined,
      CAMERA_STATUS_LABELS[c.status],
      CAMERA_TYPE_LABELS[c.type as CameraType],
      c.brand,
      c.model,
      c.resolutionMp,
      c.lensMm,
      c.cameraCount,
      c.location.lat,
      c.location.lng,
      c.gpsAccuracyM,
      c.address,
      ...p.items.map((i) => i.value),
      `${p.done}/${p.total}`,
      c.photoCount,
      c.surveyorName,
      c.surveyedAt ? formatDateTime(c.surveyedAt) : undefined,
    ];
  });
  return toCsv([header, ...rows]);
}

/** A file name without characters that file systems reject. */
export function reportFileName(projectName: string, date = new Date()): string {
  const safe = projectName
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // The local calendar day, as on the dashboard.
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: DASHBOARD_TIME_ZONE,
  }).format(date);
  return `${safe || 'project'} - จุดกล้อง ${day}.csv`;
}
