const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const WILDCARD_HOSTS = new Set(['0.0.0.0', '::']);

/**
 * The API speaks plain HTTP, so the session cookie must never cross a real
 * network unencrypted. Allowed:
 * - loopback, always (running on the host);
 * - the wildcard address only inside a container on an internal Docker
 *   network, signalled by API_CONTAINER_NETWORK=internal. compose publishes
 *   no API port (scripts/check-compose.mjs enforces it), so only the web
 *   container can reach it; Caddy (TLS) is the only entry point.
 */
export function assertListenHost(
  host: string,
  containerNetwork?: string,
): void {
  const h = host.trim().toLowerCase();
  if (LOOPBACK_HOSTS.has(h)) return;
  if (containerNetwork === 'internal' && WILDCARD_HOSTS.has(h)) return;
  throw new Error(
    `API_HOST=${host} is not allowed. The API serves plain HTTP: bind to ` +
      '127.0.0.1, or to 0.0.0.0 only inside a container on an internal ' +
      'network (API_CONTAINER_NETWORK=internal).',
  );
}
