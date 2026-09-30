const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * The API speaks plain HTTP, so the session cookie must never cross the
 * network unencrypted. It listens on loopback only; the TLS reverse proxy
 * (Phase 7) is the only public entry point. Relax this only behind TLS.
 */
export function assertLoopbackHost(host: string): void {
  if (!LOOPBACK_HOSTS.has(host.trim().toLowerCase())) {
    throw new Error(
      `API_HOST=${host} is not a loopback address. The API serves plain HTTP; ` +
        'bind to 127.0.0.1 and publish it through the TLS reverse proxy.',
    );
  }
}
