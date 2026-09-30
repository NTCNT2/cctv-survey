const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * The API has no authentication yet, so it must never listen on a public
 * interface. Remove this guard only once auth is in place.
 */
export function assertLoopbackHost(host: string): void {
  if (!LOOPBACK_HOSTS.has(host.trim().toLowerCase())) {
    throw new Error(
      `API_HOST=${host} is not a loopback address. The API has no authentication ` +
        'yet; bind to 127.0.0.1 and publish it through the reverse proxy.',
    );
  }
}
