import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/types.js';

/** Revokes every live session of a user (password change/reset, deactivation). */
export async function revokeAllSessions(
  db: Kysely<DB>,
  userId: string,
): Promise<void> {
  await db
    .updateTable('user_sessions')
    .set({ revoked_at: sql<Date>`now()` })
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .execute();
}
