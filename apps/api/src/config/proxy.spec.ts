import { parseTrustProxyHops } from './proxy.js';

describe('parseTrustProxyHops', () => {
  it.each([
    [undefined, 0],
    ['', 0],
    ['0', 0],
    ['2', 2],
    ['3', 3],
  ])('%s -> %i', (v, n) => {
    expect(parseTrustProxyHops(v)).toBe(n);
  });

  it.each(['-1', '4', '1.5', 'true', 'all', 'loopback'])('rejects %s', (v) => {
    expect(() => parseTrustProxyHops(v)).toThrow(/0–3/);
  });
});
