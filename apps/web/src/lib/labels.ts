import type {
  CameraPurpose,
  CameraStatus,
  CameraType,
  MountType,
  PhotoType,
  ProjectStatus,
  StructureType,
  UserRole,
} from '@cctv/shared';
import type { BadgeTone } from '@/components/ui';

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: 'ร่าง',
  surveying: 'กำลังสำรวจ',
  designed: 'ออกแบบแล้ว',
  quoted: 'เสนอราคาแล้ว',
  installing: 'กำลังติดตั้ง',
  completed: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก',
};

/** Badge colour per project status (see `Badge`). */
export const PROJECT_STATUS_TONES: Record<ProjectStatus, BadgeTone> = {
  draft: 'neutral',
  surveying: 'blue',
  designed: 'violet',
  quoted: 'cyan',
  installing: 'amber',
  completed: 'green',
  cancelled: 'muted',
};

/** The project workflow in order; `cancelled` is outside it. */
export const PROJECT_STAGES = [
  'draft',
  'surveying',
  'designed',
  'quoted',
  'installing',
  'completed',
] as const satisfies readonly ProjectStatus[];

/**
 * Position of a status in the workflow, e.g. surveying → { step: 2, of: 6 }.
 * Derived from the status only (the API has no progress field); null when
 * the project is cancelled.
 */
export function projectStage(
  status: ProjectStatus,
): { step: number; of: number } | null {
  const i = (PROJECT_STAGES as readonly ProjectStatus[]).indexOf(status);
  return i < 0 ? null : { step: i + 1, of: PROJECT_STAGES.length };
}

export const CAMERA_STATUS_LABELS: Record<CameraStatus, string> = {
  pending_survey: 'รอสำรวจ',
  surveyed: 'สำรวจแล้ว',
  pending_design: 'รอออกแบบ',
  pending_install: 'รอติดตั้ง',
  installed: 'ติดตั้งแล้ว',
  issue: 'มีปัญหา',
};

/** Badge colour per camera status (design system, Phase 1). */
export const CAMERA_STATUS_TONES: Record<CameraStatus, BadgeTone> = {
  pending_survey: 'amber',
  surveyed: 'blue',
  pending_design: 'orange',
  pending_install: 'violet',
  installed: 'green',
  issue: 'red',
};

/** Marker colours on the survey map (same hues as the badges, solid). */
export const CAMERA_STATUS_COLORS: Record<CameraStatus, string> = {
  pending_survey: '#eab308', // yellow
  surveyed: '#3b82f6', // blue
  pending_design: '#f97316', // orange
  pending_install: '#8b5cf6', // purple
  installed: '#10b981', // green
  issue: '#ef4444', // red
};

export const CAMERA_TYPE_LABELS: Record<CameraType, string> = {
  dome: 'Dome',
  bullet: 'Bullet',
  turret: 'Turret',
  ptz: 'PTZ',
  fisheye: 'Fisheye',
  box: 'Fixed (Box)',
};

export const CAMERA_PURPOSE_LABELS: Record<CameraPurpose, string> = {
  entrance: 'ทางเข้า',
  road: 'ถนน',
  parking: 'ลานจอดรถ',
  walkway: 'ทางเดิน',
  building: 'อาคาร',
  critical_area: 'พื้นที่สำคัญ',
  other: 'อื่นๆ',
};

export const STRUCTURE_TYPE_LABELS: Record<StructureType, string> = {
  new_pole: 'เสาใหม่',
  existing_pole: 'เสาไฟเดิม',
  building: 'อาคาร',
  wall: 'ติดผนัง',
};

export const MOUNT_TYPE_LABELS: Record<MountType, string> = {
  wall: 'ผนัง',
  ceiling: 'เพดาน',
  pole: 'เสา',
  corner: 'มุม',
};

/** Photo types of the API (0006), in the order offered to the user. */
export const PHOTO_TYPE_LABELS: Record<PhotoType, string> = {
  installation_point: 'จุดติดตั้ง',
  pole_structure: 'เสา/โครงสร้าง',
  cabinet_equipment: 'ตู้ควบคุม/อุปกรณ์',
  cable_route: 'แนวเดินสาย',
  site: 'ภาพรวมหน้างาน',
  other: 'อื่น ๆ',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'ผู้ดูแลระบบ',
  surveyor: 'ผู้สำรวจ',
  engineer: 'วิศวกร',
  viewer: 'ผู้ดู',
};

/** What each role may do (ROLE_PERMISSIONS in @cctv/shared), for admins. */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  surveyor:
    'สร้างและแก้ไขโครงการกับ Site เพิ่ม แก้ไข และลบจุดกล้องพร้อมรูปหน้างาน',
  engineer:
    'ดูข้อมูลทั้งหมด เพิ่มและแก้ไขจุดกล้อง (สถานะ ทิศทาง FOV) แต่ลบจุดหรือแก้โครงการไม่ได้',
  viewer: 'ดูโครงการ Site และกล้องได้อย่างเดียว',
  admin: 'ทำได้ทุกอย่าง รวมถึงจัดการผู้ใช้และข้อมูลกล้อง',
};

export const ROLE_TONES: Record<UserRole, BadgeTone> = {
  admin: 'violet',
  surveyor: 'blue',
  engineer: 'cyan',
  viewer: 'neutral',
};

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(
    new Date(iso),
  );
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "3 ชั่วโมงที่ผ่านมา", "เมื่อวาน"; under a minute: "เมื่อสักครู่". */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  if (Math.abs(seconds) < 60) return 'เมื่อสักครู่';
  const rtf = new Intl.RelativeTimeFormat('th-TH', { numeric: 'auto' });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) {
      return rtf.format(Math.trunc(seconds / size), unit);
    }
  }
  return 'เมื่อสักครู่';
}
