import type {
  CameraStatus,
  CameraType,
  MountType,
  ProjectStatus,
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
  proposed: 'เสนอ',
  approved: 'อนุมัติแล้ว',
  installed: 'ติดตั้งแล้ว',
  removed: 'ถอดออก',
};

export const CAMERA_TYPE_LABELS: Record<CameraType, string> = {
  dome: 'Dome',
  bullet: 'Bullet',
  turret: 'Turret',
  ptz: 'PTZ',
  fisheye: 'Fisheye',
  box: 'Box',
};

export const MOUNT_TYPE_LABELS: Record<MountType, string> = {
  wall: 'ผนัง',
  ceiling: 'เพดาน',
  pole: 'เสา',
  corner: 'มุม',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'ผู้ดูแลระบบ',
  surveyor: 'ผู้สำรวจ',
  viewer: 'ผู้ดู',
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
