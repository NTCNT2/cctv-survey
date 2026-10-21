import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';
import type { HealthStatus } from '@cctv/shared';
import { Database } from './db/database.js';

/** A database that does not answer within this time counts as down. */
export const DB_CHECK_TIMEOUT_MS = 2000;
/** Results are reused this long, so a flood of /health hits stays one query. */
export const DB_CHECK_CACHE_MS = 2000;

@Injectable()
export class AppService {
  private readonly logger = new Logger('Health');
  /** The check in flight, shared by every caller until it settles. */
  private inFlight?: Promise<boolean>;
  /** The last query, until the database answers it (it may outlive a timeout). */
  private stuckQuery?: Promise<unknown>;
  private last?: { ok: boolean; at: number };

  constructor(private readonly db: Database) {}

  async getHealth(): Promise<HealthStatus> {
    const dbOk = await this.checkDb();
    return {
      status: dbOk ? 'ok' : 'error',
      db: dbOk ? 'ok' : 'down',
      service: 'cctv-survey-api',
      version: process.env.npm_package_version ?? '0.0.0',
      time: new Date().toISOString(),
    };
  }

  private checkDb(): Promise<boolean> {
    if (this.last && Date.now() - this.last.at < DB_CHECK_CACHE_MS) {
      return Promise.resolve(this.last.ok);
    }
    // One query at most: a hung database must not let public /health calls
    // take every pool connection away from real requests.
    this.inFlight ??= this.runCheck().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async runCheck(): Promise<boolean> {
    // A query that timed out still holds a pool connection. Wait for it to
    // settle before starting another, or a hung database would get one stuck
    // connection per check until the pool is empty.
    if (this.stuckQuery)
      return this.record(false, 'previous check still waiting');
    const query = sql`select 1`.execute(this.db);
    this.stuckQuery = query.then(
      () => (this.stuckQuery = undefined),
      () => (this.stuckQuery = undefined),
    );
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`no answer within ${DB_CHECK_TIMEOUT_MS} ms`)),
        DB_CHECK_TIMEOUT_MS,
      );
    });
    let ok: boolean;
    let reason = '';
    try {
      await Promise.race([query, timeout]);
      ok = true;
    } catch (err) {
      ok = false;
      reason = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
    }
    return this.record(ok, reason);
  }

  private record(ok: boolean, reason: string): boolean {
    // Log only state changes (and the first failure), not every 10 s probe.
    // The reason stays in the log; the HTTP body never carries it.
    if (!ok && this.last?.ok !== false) {
      this.logger.error(`database check failed: ${reason}`);
    } else if (ok && this.last?.ok === false) {
      this.logger.log('database check ok again');
    }
    this.last = { ok, at: Date.now() };
    return ok;
  }
}
