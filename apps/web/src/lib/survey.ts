import type { CameraPoint, StructureType } from '@cctv/shared';
import {
  CAMERA_PURPOSE_LABELS,
  CAMERA_STATUS_LABELS,
  STRUCTURE_TYPE_LABELS,
} from './labels';

/** Next free code in the CCTV-001 series of a project (case-insensitive). */
export function nextPointCode(labels: string[]): string {
  let max = 0;
  for (const l of labels) {
    const m = /^CCTV-(\d+)$/i.exec(l.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `CCTV-${String(max + 1).padStart(3, '0')}`;
}

/**
 * The survey detail of a camera point: 15 items in a fixed order. Each says
 * whether it is done, what it shows, and which form field fills it (the
 * "ยังขาด" list links to it).
 */
export type SurveyValues = Partial<
  Pick<
    CameraPoint,
    | 'mountHeightM'
    | 'bearingDeg'
    | 'viewDistanceM'
    | 'purpose'
    | 'structureType'
    | 'poleHeightM'
    | 'cabinetDistanceM'
    | 'cableLengthM'
    | 'powerAvailable'
    | 'poe'
    | 'networkAvailable'
    | 'fiberAvailable'
    | 'cabinetLocation'
    | 'siteConditions'
    | 'notes'
    | 'siteIssues'
    | 'status'
  >
>;

export interface SurveyItem {
  /** 1–15, as numbered in the form. */
  no: number;
  label: string;
  /** Input id in the survey form. */
  field: string;
  done: boolean;
  /** As shown on the camera detail; undefined when not filled. */
  value?: string;
}

/** A pole height only applies to a camera on a pole. */
export const POLE_STRUCTURES: readonly StructureType[] = [
  'new_pole',
  'existing_pole',
];

const unit = (v: number | undefined, u: string) =>
  v === undefined ? undefined : `${v} ${u}`;
const has = (v: boolean | undefined, yes: string, no: string) =>
  v === undefined ? undefined : v ? yes : no;
const filled = (v: string | undefined) =>
  v !== undefined && v.trim() !== '' ? v.trim() : undefined;

export function surveyItems(c: SurveyValues): SurveyItem[] {
  const noPole =
    c.structureType !== undefined && !POLE_STRUCTURES.includes(c.structureType);
  const power = has(c.powerAvailable, 'มีไฟ', 'ไม่มีไฟ');
  const network = has(c.networkAvailable, 'มี', 'ไม่มี');
  const fiber = has(c.fiberAvailable, 'มี', 'ไม่มี');
  const items: Omit<SurveyItem, 'no' | 'done'>[] = [
    {
      label: 'ความสูงติดตั้งกล้อง',
      field: 'mountHeightM',
      value: unit(c.mountHeightM, 'ม.'),
    },
    {
      label: 'ทิศทางกล้อง',
      field: 'bearingDeg',
      value: c.bearingDeg === undefined ? undefined : `${c.bearingDeg}°`,
    },
    {
      label: 'ระยะมองโดยประมาณ',
      field: 'viewDistanceM',
      value: unit(c.viewDistanceM, 'ม.'),
    },
    {
      label: 'วัตถุประสงค์การติดตั้ง',
      field: 'purpose',
      value: c.purpose && CAMERA_PURPOSE_LABELS[c.purpose],
    },
    {
      label: 'โครงสร้างติดตั้ง',
      field: 'structureType',
      value: c.structureType && STRUCTURE_TYPE_LABELS[c.structureType],
    },
    {
      label: 'ความสูงเสา',
      field: 'poleHeightM',
      value: noPole ? 'ไม่ใช้เสา' : unit(c.poleHeightM, 'ม.'),
    },
    {
      label: 'ระยะจากจุดกล้องถึงตู้ Control',
      field: 'cabinetDistanceM',
      value: unit(c.cabinetDistanceM, 'ม.'),
    },
    {
      label: 'ความยาวสายโดยประมาณ',
      field: 'cableLengthM',
      value: unit(c.cableLengthM, 'ม.'),
    },
    {
      label: 'ระบบไฟเลี้ยง',
      field: 'powerAvailable',
      value: power && (c.poe ? `${power} · ใช้ PoE` : power),
    },
    {
      label: 'ระบบ Network / Fiber',
      field: network === undefined ? 'networkAvailable' : 'fiberAvailable',
      // Done when both are answered.
      value:
        network !== undefined && fiber !== undefined
          ? `Network ${network} · Fiber ${fiber}`
          : undefined,
    },
    {
      label: 'ตำแหน่งตู้ Control / จุดรวมสาย',
      field: 'cabinetLocation',
      value: filled(c.cabinetLocation),
    },
    {
      label: 'สภาพพื้นที่ติดตั้ง / อุปสรรค',
      field: 'siteConditions',
      value: filled(c.siteConditions),
    },
    { label: 'หมายเหตุหน้างาน', field: 'notes', value: filled(c.notes) },
    {
      label: 'ความต้องการเพิ่มเติม / ปัญหาที่พบ',
      field: 'siteIssues',
      value: filled(c.siteIssues),
    },
    {
      label: 'สถานะ Survey',
      field: 'status',
      // "รอสำรวจ" is the one status that means the survey is not done.
      value:
        c.status && c.status !== 'pending_survey'
          ? CAMERA_STATUS_LABELS[c.status]
          : undefined,
    },
  ];
  return items.map((i, n) => ({
    ...i,
    no: n + 1,
    done: i.value !== undefined,
  }));
}

/** "8/15" and what is still missing. */
export function surveyProgress(c: SurveyValues) {
  const items = surveyItems(c);
  const missing = items.filter((i) => !i.done);
  return {
    items,
    missing,
    done: items.length - missing.length,
    total: items.length,
  };
}
