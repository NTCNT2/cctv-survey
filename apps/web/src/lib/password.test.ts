import { passwordSchema } from '@cctv/shared';
import { describe, expect, it } from 'vitest';
import { GENERATED_PASSWORD_LENGTH, generatePassword } from './password';

describe('generatePassword', () => {
  it('meets the shared password policy, without look-alike characters', () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(GENERATED_PASSWORD_LENGTH);
      expect(passwordSchema.safeParse(p).success).toBe(true);
      expect(p).toMatch(/^[a-zA-Z2-9]+$/);
      expect(p).not.toMatch(/[01OlI]/);
    }
  });

  it('is not repeated', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generatePassword()));
    expect(seen.size).toBe(500);
  });

  it('skips bytes that would bias the result', () => {
    // 255 is above the largest multiple of the alphabet size: never used.
    const bytes = [255, 255, 0, 1, 2];
    const random = (b: Uint8Array) => {
      b.fill(0);
      bytes.forEach((v, i) => (b[i] = v));
      return b;
    };
    expect(generatePassword(3, random)).toBe('abc');
  });
});
