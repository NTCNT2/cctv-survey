export const CAMERA_TYPES = [
  'dome',
  'bullet',
  'turret',
  'ptz',
  'fisheye',
  'box',
] as const;
export type CameraType = (typeof CAMERA_TYPES)[number];

/**
 * Survey lifecycle of a camera point (0004): planned → recorded on site →
 * design → installation; `issue` flags a point that needs attention.
 */
export const CAMERA_STATUSES = [
  'pending_survey',
  'surveyed',
  'pending_design',
  'pending_install',
  'installed',
  'issue',
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

export const USER_ROLES = ['admin', 'surveyor', 'engineer', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** What a camera point is meant to watch. */
export const CAMERA_PURPOSES = [
  'entrance',
  'road',
  'parking',
  'walkway',
  'building',
  'critical_area',
  'other',
] as const;
export type CameraPurpose = (typeof CAMERA_PURPOSES)[number];

/** What the camera is installed on. */
export const STRUCTURE_TYPES = [
  'new_pole',
  'existing_pole',
  'building',
  'wall',
] as const;
export type StructureType = (typeof STRUCTURE_TYPES)[number];
