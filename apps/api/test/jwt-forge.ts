import { createHmac } from 'node:crypto';

const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');

/**
 * Hand-builds JWTs for negative tests (alg none, wrong key, expired, wrong
 * audience) without going through the code under test.
 */
export function forgeJwt(
  payload: Record<string, unknown>,
  opts: { secret?: string; alg?: 'HS256' | 'none' } = {},
): string {
  const alg = opts.alg ?? 'HS256';
  const head = `${b64({ alg, typ: 'JWT' })}.${b64(payload)}`;
  if (alg === 'none') return `${head}.`;
  const sig = createHmac('sha256', opts.secret ?? '')
    .update(head)
    .digest('base64url');
  return `${head}.${sig}`;
}

export const now = () => Math.floor(Date.now() / 1000);
