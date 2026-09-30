import type { UserRole } from '@cctv/shared';
import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'kysely';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { Database } from '../src/db/database.js';
import { UsersService } from '../src/users/users.service.js';

export async function createTestApp(
  logger?: LoggerService,
): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>(
    logger ? { logger } : {},
  );
  configureApp(app);
  await app.init();
  return app;
}

export interface TestUser {
  id: string;
  username: string;
  password: string;
  role: UserRole;
}

/** Tracks users created by a spec so they can be removed afterwards. */
export class UserFactory {
  readonly created: string[] = [];

  constructor(private readonly app: INestApplication<App>) {}

  async create(role: UserRole): Promise<TestUser> {
    const username = `e2e-${role}-${randomBytes(4).toString('hex')}`;
    const password = randomBytes(18).toString('base64url');
    const user = await this.app
      .get(UsersService)
      .create({ username, password, role });
    this.created.push(user.id);
    return { id: user.id, username, password, role };
  }

  /**
   * Test database only: removes this spec's users and their sessions. Users
   * are never deleted through the API.
   */
  async cleanup(): Promise<void> {
    if (this.created.length === 0) return;
    const db = this.app.get(Database);
    const { rows } = await sql<{
      db: string;
    }>`select current_database() as db`.execute(db);
    if (!rows[0].db.endsWith('_test')) {
      throw new Error(`refusing to delete users in ${rows[0].db}`);
    }
    await db
      .deleteFrom('user_sessions')
      .where('user_id', 'in', this.created)
      .execute();
    await db.deleteFrom('users').where('id', 'in', this.created).execute();
  }
}

/** Returns a supertest agent that carries the session cookie after login. */
export async function loginAgent(
  app: INestApplication<App>,
  user: Pick<TestUser, 'username' | 'password'>,
) {
  const agent = request.agent(app.getHttpServer());
  await agent
    .post('/api/auth/login')
    .send({ username: user.username, password: user.password })
    .expect(200);
  return agent;
}

/** The raw `cctv_session=...` pair from a login response. */
export function sessionCookie(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((c) => c.startsWith('cctv_session='));
  if (!cookie) throw new Error('no session cookie in response');
  return cookie.split(';')[0];
}
