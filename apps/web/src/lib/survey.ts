import type { CameraPoint, StructureType } from '@cctv/shared';
import {
  CAMERA_PURPOSE_LABELS,
  CAMERA_STATUS_LABELS,
  NETWORK_TYPE_LABELS,
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
 * whether it is done, what it shows, which form field fills it (the "ยังขาด"
 * list links to it) and its group:
 * - main   (9) what the design needs; the progress counts only these
 * - extra  (4) free text, optional
 * - auto   (1) the system can suggest it (cable length from the cabinet distance)
 * - status (1) set when the point is created; changed by hand when needed
 * Nothing is required to save: the progress only shows what is still open.
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
    | 'networkType'
    | 'cabinetLocation'
    | 'siteConditions'
    | 'notes'
    | 'siteIssues'
    | 'status'
  >
>;

export type SurveyGroup = 'main' | 'extra' | 'auto' | 'status';

export interface SurveyItem {
  /** 1–15, as numbered in the form. */
  no: number;
  group: SurveyGroup;
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
  const items: Omit<SurveyItem, 'no' | 'done' | 'group'>[] = [
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
      value: power,
    },
    {
      label: 'ระบบเครือข่าย',
      field: 'networkType',
      // Done once fibre or SIM is chosen (0008).
      value: c.networkType && NETWORK_TYPE_LABELS[c.networkType],
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
    group: GROUPS[n],
    done: i.value !== undefined,
  }));
}

/** Group of items 1–15, in order. */
const GROUPS: readonly SurveyGroup[] = [
  ...(['main', 'main', 'main', 'main', 'main', 'main', 'main'] as const),
  'auto',
  'main',
  'main',
  ...(['extra', 'extra', 'extra', 'extra'] as const),
  'status',
];

/**
 * "ข้อมูลหลัก 7/9" (main items) and which of them are still missing; the
 * optional items are counted on their own ("เพิ่มเติม 1/4").
 */
export function surveyProgress(c: SurveyValues) {
  const items = surveyItems(c);
  const main = items.filter((i) => i.group === 'main');
  const extra = items.filter((i) => i.group === 'extra');
  const missing = main.filter((i) => !i.done);
  return {
    items,
    missing,
    done: main.length - missing.length,
    total: main.length,
    extraDone: extra.filter((i) => i.done).length,
    extraTotal: extra.length,
  };
}

/**
 * Suggested cable length for a cabinet distance: the route is rarely
 * straight, so 20 % more plus 5 m for the ends, rounded up to whole metres.
 * Only a suggestion: the form offers it, the user decides.
 */
export function suggestCableLength(
  cabinetDistanceM: number | undefined,
): number | undefined {
  if (cabinetDistanceM === undefined || !(cabinetDistanceM > 0)) {
    return undefined;
  }
  return Math.min(1000, Math.ceil(cabinetDistanceM * 1.2 + 5));
}

/** The 8 compass directions offered as quick picks (degrees from north). */
export const COMPASS: readonly { deg: number; short: string; name: string }[] =
  [
    { deg: 0, short: 'N', name: 'ทิศเหนือ' },
    { deg: 45, short: 'NE', name: 'ทิศตะวันออกเฉียงเหนือ' },
    { deg: 90, short: 'E', name: 'ทิศตะวันออก' },
    { deg: 135, short: 'SE', name: 'ทิศตะวันออกเฉียงใต้' },
    { deg: 180, short: 'S', name: 'ทิศใต้' },
    { deg: 225, short: 'SW', name: 'ทิศตะวันตกเฉียงใต้' },
    { deg: 270, short: 'W', name: 'ทิศตะวันตก' },
    { deg: 315, short: 'NW', name: 'ทิศตะวันตกเฉียงเหนือ' },
  ];

/** Nearest of the 8 directions, e.g. 100° → ทิศตะวันออก. */
export function compassName(deg: number | undefined): string | undefined {
  if (deg === undefined || !Number.isFinite(deg)) return undefined;
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return COMPASS[i].name;
}
