/**
 * Letters and digits without look-alikes (0/O, 1/l/I), so a password read out
 * or typed from a phone screen is not mistyped. 57 symbols × 16 ≈ 93 bits.
 */
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const GENERATED_PASSWORD_LENGTH = 16;

/**
 * A random password for a new or reset account, made in the browser with the
 * Web Crypto API (never Math.random). Rejection sampling keeps every symbol
 * equally likely.
 */
export function generatePassword(
  length = GENERATED_PASSWORD_LENGTH,
  random: (buf: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b),
): string {
  // Largest multiple of the alphabet size that fits in a byte.
  const limit = 256 - (256 % ALPHABET.length);
  let out = '';
  while (out.length < length) {
    for (const byte of random(new Uint8Array(length * 2))) {
      if (byte < limit) out += ALPHABET[byte % ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}
