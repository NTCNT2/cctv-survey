import { Kysely } from 'kysely';
import type { DB } from './types.js';

/** Injectable Kysely instance (class token, so no @Inject() is needed). */
export class Database extends Kysely<DB> {}
