import type { AuthUser, ChangePasswordInput, LoginInput } from '@cctv/shared';
import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { sql } from 'kysely';
import type { AuthConfig } from '../config/auth-config.js';
import { Database } from '../db/database.js';
import { AUTH_CONFIG } from './auth.constants.js';
import { PasswordService } from './password.service.js';
import { revokeAllSessions } from './sessions.js';
import { TokenService } from './token.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same message for unknown user, wrong password and inactive account. */
const invalidLogin = () =>
  new UnauthorizedException('invalid username or password');

export interface LoginResult {
  user: AuthUser;
  token: string;
  expiresAt: Date;
}

export interface Session {
  user: AuthUser;
  sessionId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async login({ username, password }: LoginInput): Promise<LoginResult> {
    const row = await this.db
      .selectFrom('users')
      .select([
        'id',
        'username',
        'display_name',
        'role',
        'is_active',
        'password_hash',
      ])
      .where('username', '=', username)
      .executeTakeFirst();

    if (!row) {
      await this.passwords.verifyDummy(password);
      throw invalidLogin();
    }
    const ok = await this.passwords.verify(row.password_hash, password);
    if (!ok || !row.is_active) throw invalidLogin();

    // Upgrade the stored hash when the Argon2 parameters have changed.
    const newHash = this.passwords.needsRehash(row.password_hash)
      ? await this.passwords.hash(password)
      : undefined;

    const session = await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('users')
        .set({
          last_login_at: sql<Date>`now()`,
          ...(newHash && { password_hash: newHash }),
        })
        .where('id', '=', row.id)
        .execute();
      return trx
        .insertInto('user_sessions')
        .values({
          user_id: row.id,
          expires_at: sql<Date>`now() + make_interval(secs => ${this.config.ttlSeconds})`,
        })
        .returning(['id', 'expires_at'])
        .executeTakeFirstOrThrow();
    });

    return {
      user: {
        id: row.id,
        username: row.username,
        displayName: row.display_name ?? undefined,
        role: row.role,
      },
      token: await this.tokens.sign({ sub: row.id, jti: session.id }),
      expiresAt: session.expires_at,
    };
  }

  /**
   * Valid only while the JWT verifies AND its session row is live AND the user
   * is active. The role comes from the database, never from the token.
   */
  async authenticate(token: string): Promise<Session | undefined> {
    const claims = await this.tokens.verify(token);
    if (!claims || !UUID.test(claims.jti) || !UUID.test(claims.sub)) {
      return undefined;
    }
    const row = await this.db
      .selectFrom('user_sessions as s')
      .innerJoin('users as u', 'u.id', 's.user_id')
      .select([
        's.id as session_id',
        'u.id',
        'u.username',
        'u.display_name',
        'u.role',
      ])
      .where('s.id', '=', claims.jti)
      .where('s.user_id', '=', claims.sub)
      .where('s.revoked_at', 'is', null)
      .where('s.expires_at', '>', sql<Date>`now()`)
      .where('u.is_active', '=', true)
      .executeTakeFirst();
    if (!row) return undefined;
    return {
      sessionId: row.session_id,
      user: {
        id: row.id,
        username: row.username,
        displayName: row.display_name ?? undefined,
        role: row.role,
      },
    };
  }

  /** Revokes the session a token belongs to; silently ignores bad tokens. */
  async logout(token: string | undefined): Promise<void> {
    const claims = token ? await this.tokens.verify(token) : undefined;
    if (!claims || !UUID.test(claims.jti)) return;
    await this.db
      .updateTable('user_sessions')
      .set({ revoked_at: sql<Date>`now()` })
      .where('id', '=', claims.jti)
      .where('revoked_at', 'is', null)
      .execute();
  }

  /** Changes the password and revokes every session, including this one. */
  async changePassword(
    user: AuthUser,
    { currentPassword, newPassword }: ChangePasswordInput,
  ): Promise<void> {
    const row = await this.db
      .selectFrom('users')
      .select('password_hash')
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();
    if (!(await this.passwords.verify(row.password_hash, currentPassword))) {
      throw new BadRequestException('current password is incorrect');
    }
    if (newPassword.toLowerCase() === user.username) {
      throw new BadRequestException('password must not equal the username');
    }
    const hash = await this.passwords.hash(newPassword);
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('users')
        .set({ password_hash: hash })
        .where('id', '=', user.id)
        .execute();
      await revokeAllSessions(trx, user.id);
    });
  }
}
