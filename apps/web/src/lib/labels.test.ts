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
  PROJECT_STATUS_TONES,
  formatRelative,
  projectStage,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_TONES,
} from './labels';

describe('labels cover every shared enum value', () => {
  it.each([
    ['project statuses', PROJECT_STATUSES, PROJECT_STATUS_LABELS],
    ['camera statuses', CAMERA_STATUSES, CAMERA_STATUS_LABELS],
    ['camera types', CAMERA_TYPES, CAMERA_TYPE_LABELS],
    ['mount types', MOUNT_TYPES, MOUNT_TYPE_LABELS],
    ['roles', USER_ROLES, ROLE_LABELS],
    ['role descriptions', USER_ROLES, ROLE_DESCRIPTIONS],
    ['role tones', USER_ROLES, ROLE_TONES],
  ] as const)('%s', (_, values, labels) => {
    expect(Object.keys(labels).sort()).toEqual([...values].sort());
    for (const v of values) {
      expect((labels as Record<string, string>)[v]).toBeTruthy();
    }
  });
});

describe('project workflow helpers', () => {
  it('gives every status a badge tone', () => {
    for (const s of PROJECT_STATUSES)
      expect(PROJECT_STATUS_TONES[s]).toBeTruthy();
  });

  it('maps a status to its workflow step; cancelled has none', () => {
    expect(projectStage('draft')).toEqual({ step: 1, of: 6 });
    expect(projectStage('surveying')).toEqual({ step: 2, of: 6 });
    expect(projectStage('completed')).toEqual({ step: 6, of: 6 });
    expect(projectStage('cancelled')).toBeNull();
  });
});

describe('formatRelative', () => {
  const now = Date.parse('2026-10-04T12:00:00Z');
  const ago = (s: number) => new Date(now - s * 1000).toISOString();

  it('says "just now" under a minute', () => {
    expect(formatRelative(ago(30), now)).toBe('เมื่อสักครู่');
  });

  it('uses the largest whole unit', () => {
    expect(formatRelative(ago(5 * 60), now)).toBe('5 นาทีที่ผ่านมา');
    expect(formatRelative(ago(3 * 3600), now)).toBe('3 ชั่วโมงที่ผ่านมา');
    expect(formatRelative(ago(24 * 3600), now)).toBe('เมื่อวาน');
    expect(formatRelative(ago(3 * 24 * 3600), now)).toBe('3 วันที่ผ่านมา');
  });
});
