import { assertListenHost } from './loopback.js';

describe('assertListenHost', () => {
  it.each(['127.0.0.1', '::1', 'localhost', ' LOCALHOST '])(
    'allows loopback %s anywhere',
    (host) => {
      expect(() => assertListenHost(host)).not.toThrow();
      expect(() => assertListenHost(host, 'internal')).not.toThrow();
    },
  );

  it.each(['0.0.0.0', '::', '192.168.1.10', '127.0.0.2', ''])(
    'rejects %s outside a container',
    (host) => {
      expect(() => assertListenHost(host)).toThrow(/not allowed/);
    },
  );

  it.each(['0.0.0.0', '::'])(
    'allows %s only with API_CONTAINER_NETWORK=internal',
    (host) => {
      expect(() => assertListenHost(host, 'internal')).not.toThrow();
      expect(() => assertListenHost(host, 'bridge')).toThrow(/not allowed/);
      expect(() => assertListenHost(host, '')).toThrow(/not allowed/);
    },
  );

  it.each(['192.168.77.15', '172.18.0.2', '127.0.0.2'])(
    'never allows a specific non-loopback address (%s), even in a container',
    (host) => {
      expect(() => assertListenHost(host, 'internal')).toThrow(/not allowed/);
    },
  );
});
