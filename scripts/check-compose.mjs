#!/usr/bin/env node
// Refuses a compose.yaml that would expose more than intended (Phase 7).
// Reads the file without interpolation, so no secret is ever printed.
import { execFileSync } from 'node:child_process';

const cfg = JSON.parse(
  execFileSync(
    'docker',
    [
      'compose',
      '--profile',
      'stacktest',
      'config',
      '--no-interpolate',
      '--format',
      'json',
    ],
    { encoding: 'utf8' },
  ),
);
const allowPorts = { db: /^127\.0\.0\.1:/, proxy: /^127\.0\.0\.1$/ };
const errors = [];
for (const [name, s] of Object.entries(cfg.services)) {
  for (const p of s.ports ?? []) {
    const host = typeof p === 'string' ? p : (p.host_ip ?? '');
    if (!allowPorts[name]?.test(host)) {
      errors.push(`${name} publishes a port on "${host || 'ALL interfaces'}"`);
    }
  }
}
for (const name of ['api', 'web', 'stacktest-db']) {
  if (cfg.services[name]?.ports?.length) {
    errors.push(`${name} must not publish ports`);
  }
}
for (const name of ['api', 'web', 'proxy', 'stacktest-db']) {
  if (
    cfg.services[name]?.networks &&
    'backend' in cfg.services[name].networks
  ) {
    errors.push(`${name} must not join the "backend" network (existing db)`);
  }
}
// web <-> api and api <-> stacktest-db must have no route to the outside.
for (const net of ['stacktest-app', 'stacktest-data']) {
  if (cfg.networks?.[net]?.internal !== true) {
    errors.push(`network "${net}" must be internal: true`);
  }
}
// The existing db stays on "backend" only; the test stack never reaches it.
for (const net of Object.keys(cfg.services.db?.networks ?? {})) {
  if (net.startsWith('stacktest-')) {
    errors.push(`db must not join the "${net}" network`);
  }
}
// The existing database volume belongs to `db` alone.
for (const name of ['api', 'web', 'proxy', 'stacktest-db']) {
  for (const v of cfg.services[name]?.volumes ?? []) {
    if (v.type === 'volume' && v.source === 'pgdata') {
      errors.push(`${name} must not mount the "pgdata" volume (existing db)`);
    }
  }
}
if (errors.length) {
  console.error('compose check FAILED:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log(
  'compose check OK: only db and proxy publish ports, all on 127.0.0.1; stack is off "backend" and "pgdata"; stacktest-app/data are internal',
);
