import { assertLoopbackHost } from './loopback.js';

describe('assertLoopbackHost', () => {
  it.each(['127.0.0.1', '::1', 'localhost', ' LOCALHOST '])(
    'allows %s',
    (host) => {
      expect(() => assertLoopbackHost(host)).not.toThrow();
    },
  );

  it.each(['0.0.0.0', '::', '192.168.1.10', '127.0.0.2', ''])(
    'rejects %s',
    (host) => {
      expect(() => assertLoopbackHost(host)).toThrow(/not a loopback/);
    },
  );
});
