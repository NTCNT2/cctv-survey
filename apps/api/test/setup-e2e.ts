// Points the e2e suite at the separate test database (created by `pnpm db:test`)
// so tests never write to the dev database. Runs before each test file is imported.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

try {
  process.loadEnvFile('../../.env');
} catch {
  // no root .env — rely on the environment
}

const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!base) throw new Error('set DATABASE_URL (or TEST_DATABASE_URL) for e2e');

const url = new URL(base);
if (!process.env.TEST_DATABASE_URL) url.pathname = '/cctv_survey_test';
if (!url.pathname.endsWith('_test')) {
  throw new Error(
    `refusing to run e2e against non-test database ${url.pathname}`,
  );
}
process.env.DATABASE_URL = url.toString();

// Tests never use the real signing key: a fresh random one per run.
process.env.JWT_SECRET = randomBytes(48).toString('base64url');
process.env.JWT_EXPIRES_IN = '8h';
process.env.COOKIE_SECURE = 'false';
process.env.NODE_ENV = 'test';
// Photo files go to a throwaway directory, never the real upload volume.
const uploadDir = mkdtempSync(path.join(tmpdir(), 'cctv-e2e-uploads-'));
process.env.UPLOAD_DIR = uploadDir;
afterAll(() => rmSync(uploadDir, { recursive: true, force: true }));
// Rate limits run with their production defaults (see auth.e2e-spec.ts).
for (const key of [
  'LOGIN_LIMIT_PER_IP',
  'LOGIN_LIMIT_PER_ACCOUNT',
  'LOGIN_LIMIT_PER_USERNAME',
  'PASSWORD_CHANGE_LIMIT',
]) {
  delete process.env[key];
}
