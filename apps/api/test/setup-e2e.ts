// Points the e2e suite at the separate test database (created by `pnpm db:test`)
// so tests never write to the dev database. Runs before each test file is imported.
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
