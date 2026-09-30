import type {
  CameraStatus,
  CameraType,
  MountType,
  ProjectStatus,
  UserRole,
} from '@cctv/shared';

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: 'ร่าง',
  surveying: 'กำลังสำรวจ',
  designed: 'ออกแบบแล้ว',
  quoted: 'เสนอราคาแล้ว',
  installing: 'กำลังติดตั้ง',
  completed: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก',
};

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
