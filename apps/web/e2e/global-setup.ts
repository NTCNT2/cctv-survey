import { request } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { BASE_URL, MODELS, storage, users } from './env';

/**
 * Signs in once per role and saves the browser state (the HttpOnly session
 * cookie). Tests reuse it, so the suite stays far below the per-username
 * login limits.
 */
export default async function globalSetup() {
  mkdirSync('e2e/.auth', { recursive: true });
  for (const role of ['admin', 'surveyor', 'viewer'] as const) {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const res = await ctx.post('/api/auth/login', { data: users[role] });
    if (!res.ok()) throw new Error(`login ${role}: HTTP ${res.status()}`);
    await ctx.storageState({ path: storage[role] });
    if (role === 'admin') {
      for (const m of Object.values(MODELS)) {
        const r = await ctx.post('/api/camera-models', { data: m });
        if (!r.ok()) throw new Error(`seed camera model: HTTP ${r.status()}`);
      }
    }
    await ctx.dispose();
  }
}
