import { describe, expect, it } from 'vitest';
import { nextPointCode } from './survey';

describe('nextPointCode', () => {
  it('starts at CCTV-001', () => {
    expect(nextPointCode([])).toBe('CCTV-001');
    expect(nextPointCode(['CAM-01', 'หน้าเทศบาล'])).toBe('CCTV-001');
  });

  it('continues after the highest number, ignoring gaps and case', () => {
    expect(nextPointCode(['CCTV-001', 'cctv-007', 'CCTV-003'])).toBe(
      'CCTV-008',
    );
    expect(nextPointCode(['CCTV-999'])).toBe('CCTV-1000');
  });
});
