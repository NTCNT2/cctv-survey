import type { APIRequestContext, Page } from '@playwright/test';
import { request } from '@playwright/test';

/** Values provided by scripts/web-e2e.sh (test database only). */
function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set — run the suite via \`pnpm test:e2e:web\``,
    );
  }
  return v;
}

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100';
/** Every project created by the suite starts with this, for cleanup. */
export const PREFIX = required('E2E_PREFIX');

export interface E2EUser {
  username: string;
  password: string;
}

const user = (role: string): E2EUser => ({
  username: required(`E2E_${role}_USER`),
  password: required(`E2E_${role}_PASS`),
});

export const users = {
  admin: user('ADMIN'),
  surveyor: user('SURVEYOR'),
  viewer: user('VIEWER'),
  /** Only used to exercise the login form. */
  login: user('LOGIN'),
  /** Changes its own password during the run. */
  pwchange: user('PWCHANGE'),
  /** Gets deactivated during the run. */
  victim: user('VICTIM'),
};

export const storage = {
  admin: 'e2e/.auth/admin.json',
  surveyor: 'e2e/.auth/surveyor.json',
  viewer: 'e2e/.auth/viewer.json',
};

/** An API client signed in as admin (reuses the saved session), for seeding. */
export async function adminApi(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: BASE_URL, storageState: storage.admin });
}

export async function seedProject(
  api: APIRequestContext,
  name: string,
  withChildren = true,
) {
  const p = await api.post('/api/projects', {
    data: { name: `${PREFIX} ${name}`, customerName: 'ลูกค้าทดสอบ' },
  });
  if (!p.ok()) throw new Error(`seed project: ${p.status()}`);
  const project = (await p.json()) as { id: string; name: string };
  if (!withChildren) return { project };
  const s = await api.post('/api/sites', {
    data: { projectId: project.id, name: 'อาคาร A' },
  });
  const site = (await s.json()) as { id: string };
  const c = await api.post('/api/cameras', {
    data: {
      projectId: project.id,
      siteId: site.id,
      label: 'CAM-01',
      type: 'dome',
      location: { lat: 13.7563, lng: 100.5018 },
    },
  });
  const camera = (await c.json()) as { id: string };
  return { project, site, camera };
}

/** The project list on /projects (names also appear in the desktop overview). */
export const projectList = (page: Page) =>
  page.getByRole('list', { name: 'รายการโครงการ' });
