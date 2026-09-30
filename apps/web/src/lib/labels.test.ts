import {
  CAMERA_STATUSES,
  CAMERA_TYPES,
  MOUNT_TYPES,
  PROJECT_STATUSES,
  USER_ROLES,
} from '@cctv/shared';
import { describe, expect, it } from 'vitest';
import {
  CAMERA_STATUS_LABELS,
  CAMERA_TYPE_LABELS,
  MOUNT_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
  ROLE_LABELS,
} from './labels';

describe('labels cover every shared enum value', () => {
  it.each([
    ['project statuses', PROJECT_STATUSES, PROJECT_STATUS_LABELS],
    ['camera statuses', CAMERA_STATUSES, CAMERA_STATUS_LABELS],
    ['camera types', CAMERA_TYPES, CAMERA_TYPE_LABELS],
    ['mount types', MOUNT_TYPES, MOUNT_TYPE_LABELS],
    ['roles', USER_ROLES, ROLE_LABELS],
  ] as const)('%s', (_, values, labels) => {
    expect(Object.keys(labels).sort()).toEqual([...values].sort());
    for (const v of values) {
      expect((labels as Record<string, string>)[v]).toBeTruthy();
    }
  });
});
