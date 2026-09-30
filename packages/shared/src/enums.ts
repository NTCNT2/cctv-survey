export const CAMERA_TYPES = [
  'dome',
  'bullet',
  'turret',
  'ptz',
  'fisheye',
  'box',
] as const;
export type CameraType = (typeof CAMERA_TYPES)[number];

/** Lifecycle of a camera point from survey to installation. */
export const CAMERA_STATUSES = [
  'proposed',
  'approved',
  'installed',
  'removed',
] as const;
export type CameraStatus = (typeof CAMERA_STATUSES)[number];

export const PROJECT_STATUSES = [
  'draft',
  'surveying',
  'designed',
  'quoted',
  'installing',
  'completed',
  'cancelled',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const MOUNT_TYPES = ['wall', 'ceiling', 'pole', 'corner'] as const;
export type MountType = (typeof MOUNT_TYPES)[number];

export const USER_ROLES = ['admin', 'surveyor', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];
