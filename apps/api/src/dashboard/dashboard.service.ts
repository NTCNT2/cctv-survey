import {
  DASHBOARD_DAYS,
  DASHBOARD_TIME_ZONE,
  type DashboardSummary,
} from '@cctv/shared';
import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { Database } from '../db/database.js';

const tz = DASHBOARD_TIME_ZONE;
/** First local calendar day of the period (today counts as one). */
const since = sql`((now() AT TIME ZONE ${tz})::date - ${DASHBOARD_DAYS - 1}::int)`;

@Injectable()
export class DashboardService {
  constructor(private readonly db: Database) {}

  /** Read-only aggregates; a handful of small queries in one snapshot. */
  async summary(): Promise<DashboardSummary> {
    return this.db
      .transaction()
      .setIsolationLevel('repeatable read')
      .setAccessMode('read only')
      .execute(async (trx) => {
        const totals = await sql<{
          projects: Record<string, number>;
          cameras: Record<string, number>;
          types: Record<string, number>;
          points: number;
          units: number;
          photos: number;
        }>`
          SELECT
            (SELECT coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
               FROM (SELECT status, count(*)::int AS n FROM projects GROUP BY status) p
            ) AS projects,
            (SELECT coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
               FROM (SELECT status, count(*)::int AS n FROM camera_points GROUP BY status) c
            ) AS cameras,
            (SELECT coalesce(jsonb_object_agg(type, n), '{}'::jsonb)
               FROM (SELECT type, count(*)::int AS n FROM camera_points GROUP BY type) t
            ) AS types,
            (SELECT count(*)::int FROM camera_points) AS points,
            (SELECT coalesce(sum(camera_count), 0)::int FROM camera_points) AS units,
            (SELECT count(*)::int FROM camera_photos) AS photos
        `.execute(trx);

        const days = await sql<{ date: string; points: number }>`
          SELECT d::date::text AS date, count(c.id)::int AS points
          FROM generate_series(${since}, (now() AT TIME ZONE ${tz})::date, interval '1 day') AS d
          LEFT JOIN camera_points c
            ON (c.surveyed_at AT TIME ZONE ${tz})::date = d::date
          GROUP BY d
          ORDER BY d
        `.execute(trx);

        const surveyors = await sql<{
          user_id: string;
          name: string;
          points: number;
        }>`
          SELECT u.id AS user_id, coalesce(u.display_name, u.username) AS name,
                 count(*)::int AS points
          FROM camera_points c
          JOIN users u ON u.id = c.surveyor_id
          WHERE (c.surveyed_at AT TIME ZONE ${tz})::date >= ${since}
          GROUP BY u.id
          ORDER BY points DESC, name
        `.execute(trx);

        const t = totals.rows[0];
        const projectTotal = Object.values(t.projects).reduce(
          (a, b) => a + b,
          0,
        );
        return {
          projects: { total: projectTotal, byStatus: t.projects },
          cameras: {
            points: t.points,
            units: t.units,
            byStatus: t.cameras,
            byType: t.types,
            photos: t.photos,
          },
          surveyedByDay: days.rows,
          surveyors: surveyors.rows.map((r) => ({
            userId: r.user_id,
            name: r.name,
            points: r.points,
          })),
          generatedAt: new Date().toISOString(),
        };
      });
  }
}
