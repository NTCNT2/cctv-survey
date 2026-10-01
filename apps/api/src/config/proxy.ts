/**
 * How many reverse proxies in front of the API may set X-Forwarded-For.
 * - 0 (default): trust none; req.ip is the socket peer (API run on the host).
 * - Container stack: 1. Caddy replaces any client-sent X-Forwarded-For with
 *   the real client address; the Next.js rewrite (Caddy -> Next.js -> API)
 *   forwards that header unchanged and adds no entry of its own.
 * Never set it higher than the real number of hops: clients could then fake
 * their address and slip past the per-IP login limits.
 */
export function parseTrustProxyHops(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 3) {
    throw new Error(`TRUST_PROXY_HOPS must be an integer 0–3 (got "${value}")`);
  }
  return n;
}
