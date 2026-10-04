import { describe, expect, it } from 'vitest';
import {
  FRESH_MS,
  isFresh,
  statusForError,
  statusForFix,
  WEAK_ACCURACY_M,
} from './geolocation';

const fix = (accuracy: number, timestamp = 0) => ({
  lat: 13.75,
  lng: 100.5,
  accuracy,
  timestamp,
});

describe('GPS status', () => {
  it('is ready up to the weak threshold, weak above it', () => {
    expect(statusForFix(fix(4.2))).toBe('ready');
    expect(statusForFix(fix(WEAK_ACCURACY_M))).toBe('ready');
    expect(statusForFix(fix(WEAK_ACCURACY_M + 0.1))).toBe('weak');
  });

  it('maps permission denied (1) apart from other errors', () => {
    expect(statusForError(1)).toBe('denied');
    expect(statusForError(2)).toBe('unavailable');
    expect(statusForError(3)).toBe('unavailable');
  });

  it('reuses a fix only while it is fresh', () => {
    expect(isFresh(undefined, 1000)).toBe(false);
    expect(isFresh(fix(5, 1000), 1000 + FRESH_MS - 1)).toBe(true);
    expect(isFresh(fix(5, 1000), 1000 + FRESH_MS)).toBe(false);
  });
});
