import type { CreateSiteInput, Site, UpdateSiteInput } from '@cctv/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { sql, type Selectable, type UpdateObject } from 'kysely';
import { Database } from '../db/database.js';
import { pointSql, polygonSql, ringFromGeoJson, toLatLng } from '../db/geo.js';
import type { DB, SitesTable } from '../db/types.js';

const columns = [
  'id',
  'project_id',
  'name',
  'address',
  'notes',
  'created_at',
  'updated_at',
  sql<number | null>`ST_Y(location)`.as('lat'),
  sql<number | null>`ST_X(location)`.as('lng'),
  sql<{
    coordinates: number[][][];
  } | null>`ST_AsGeoJSON(boundary)::json`.as('boundary_geojson'),
] as const;

type Row = Omit<Selectable<SitesTable>, 'location' | 'boundary'> & {
  lat: number | null;
  lng: number | null;
  boundary_geojson: { coordinates: number[][][] } | null;
};

function toSite(r: Row): Site {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    address: r.address ?? undefined,
    location: toLatLng(r.lat, r.lng),
    boundary: r.boundary_geojson
      ? ringFromGeoJson(r.boundary_geojson)
      : undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

@Injectable()
export class SitesService {
  constructor(private readonly db: Database) {}

  async listByProject(projectId: string): Promise<Site[]> {
    const rows = await this.db
      .selectFrom('sites')
      .select(columns)
      .where('project_id', '=', projectId)
      .orderBy('name')
      .execute();
    return rows.map(toSite);
  }

  async get(id: string): Promise<Site> {
    const row = await this.db
      .selectFrom('sites')
      .select(columns)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('site not found');
    return toSite(row);
  }

  async create(input: CreateSiteInput): Promise<Site> {
    const row = await this.db
      .insertInto('sites')
      .values({
        project_id: input.projectId,
        name: input.name,
        address: input.address,
        location: input.location && pointSql(input.location),
        boundary: input.boundary && polygonSql(input.boundary),
        notes: input.notes,
      })
      .returning(columns)
      .executeTakeFirstOrThrow();
    return toSite(row);
  }

  async update(id: string, input: UpdateSiteInput): Promise<Site> {
    const set: UpdateObject<DB, 'sites'> = {
      name: input.name,
      address: input.address,
      location:
        input.location === undefined
          ? undefined
          : input.location && pointSql(input.location),
      boundary:
        input.boundary === undefined
          ? undefined
          : input.boundary && polygonSql(input.boundary),
      notes: input.notes,
    };
    const row = await this.db
      .updateTable('sites')
      .set(set)
      .where('id', '=', id)
      .returning(columns)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('site not found');
    return toSite(row);
  }

  /** Fails with 409 while cameras still reference the site. */
  async remove(id: string): Promise<void> {
    const res = await this.db
      .deleteFrom('sites')
      .where('id', '=', id)
      .executeTakeFirst();
    if (res.numDeletedRows === 0n) {
      throw new NotFoundException('site not found');
    }
  }
}
