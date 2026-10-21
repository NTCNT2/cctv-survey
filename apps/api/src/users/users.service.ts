import type {
  CreateUserInput,
  ResetPasswordInput,
  UpdateUserInput,
  User,
} from '@cctv/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Selectable, Transaction } from 'kysely';
import { PasswordService } from '../auth/password.service.js';
import { revokeAllSessions } from '../auth/sessions.js';
import { Database } from '../db/database.js';
import type { DB, UsersTable } from '../db/types.js';

/** Public columns only — password_hash is never selected here. */
const columns = [
  'id',
  'username',
  'display_name',
  'role',
  'is_active',
  'last_login_at',
  'created_at',
  'updated_at',
] as const;

type Row = Omit<Selectable<UsersTable>, 'password_hash'>;

function toUser(r: Row): User {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name ?? undefined,
    role: r.role,
    isActive: r.is_active,
    lastLoginAt: r.last_login_at?.toISOString(),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly db: Database,
    private readonly passwords: PasswordService,
  ) {}

  async list(): Promise<User[]> {
    const rows = await this.db
      .selectFrom('users')
      .select(columns)
      .orderBy('username')
      .execute();
    return rows.map(toUser);
  }

  async get(id: string): Promise<User> {
    const row = await this.db
      .selectFrom('users')
      .select(columns)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('user not found');
    return toUser(row);
  }

  async create(input: CreateUserInput): Promise<User> {
    const row = await this.db
      .insertInto('users')
      .values({
        username: input.username,
        display_name: input.displayName,
        role: input.role,
        password_hash: await this.passwords.hash(input.password),
      })
      .returning(columns)
      .executeTakeFirstOrThrow();
    return toUser(row);
  }

  /**
   * Role / active changes. Refuses to demote or deactivate the last active
   * admin; deactivation also revokes the user's sessions. Nobody changes
   * their own role or deactivates themselves (another admin must do it), so
   * an admin cannot lock themselves out by mistake.
   */
  async update(
    id: string,
    input: UpdateUserInput,
    actorId: string,
  ): Promise<User> {
    return this.db.transaction().execute(async (trx) => {
      const target = await this.lockForAdminChange(trx, id);
      if (
        id === actorId &&
        ((input.role !== undefined && input.role !== target.role) ||
          input.isActive === false)
      ) {
        throw new BadRequestException(
          'you cannot change your own role or deactivate yourself',
        );
      }
      const losesAdmin =
        target.role === 'admin' &&
        target.is_active &&
        ((input.role !== undefined && input.role !== 'admin') ||
          input.isActive === false);
      if (losesAdmin && target.otherActiveAdmins === 0) {
        throw new ConflictException(
          'cannot demote or deactivate the last active admin',
        );
      }

      const row = await trx
        .updateTable('users')
        .set({
          display_name: input.displayName,
          role: input.role,
          is_active: input.isActive,
        })
        .where('id', '=', id)
        .returning(columns)
        .executeTakeFirstOrThrow();
      if (input.isActive === false) await revokeAllSessions(trx, id);
      return toUser(row);
    });
  }

  /**
   * Admin reset: sets a new password and revokes every session of the user.
   * Not for the caller's own account — that must go through change-password,
   * which requires the current password.
   */
  async resetPassword(
    id: string,
    { newPassword }: ResetPasswordInput,
    actorId: string,
  ) {
    if (id === actorId) {
      throw new BadRequestException(
        'use /auth/change-password to change your own password',
      );
    }
    const user = await this.get(id);
    if (newPassword.toLowerCase() === user.username) {
      throw new BadRequestException('password must not equal the username');
    }
    const hash = await this.passwords.hash(newPassword);
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('users')
        .set({ password_hash: hash })
        .where('id', '=', id)
        .execute();
      await revokeAllSessions(trx, id);
    });
  }

  /**
   * Locks every active admin (in id order, so concurrent requests serialise
   * instead of deadlocking) and then the target row. Two admins demoting each
   * other at the same time therefore cannot both succeed.
   */
  private async lockForAdminChange(trx: Transaction<DB>, id: string) {
    const admins = await trx
      .selectFrom('users')
      .select('id')
      .where('role', '=', 'admin')
      .where('is_active', '=', true)
      .orderBy('id')
      .forUpdate()
      .execute();
    const target = await trx
      .selectFrom('users')
      .select(['id', 'role', 'is_active'])
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    if (!target) throw new NotFoundException('user not found');
    return {
      ...target,
      otherActiveAdmins: admins.filter((a) => a.id !== id).length,
    };
  }
}
