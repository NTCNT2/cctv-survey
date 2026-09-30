import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from '@cctv/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { sql, type Selectable, type UpdateObject } from 'kysely';
import type { PageQuery } from '../common/pagination.js';
import { Database } from '../db/database.js';
import { pointSql, toLatLng } from '../db/geo.js';
import type { DB, ProjectsTable } from '../db/types.js';

const columns = [
  'id',
  'name',
  'customer_name',
  'address',
  'status',
  'notes',
  'created_at',
  'updated_at',
  sql<number | null>`ST_Y(location)`.as('lat'),
  sql<number | null>`ST_X(location)`.as('lng'),
] as const;

type Row = Omit<Selectable<ProjectsTable>, 'location'> & {
  lat: number | null;
  lng: number | null;
};

function toProject(r: Row): Project {
  return {
    id: r.id,
    name: r.name,
    customerName: r.customer_name ?? undefined,
    address: r.address ?? undefined,
    location: toLatLng(r.lat, r.lng),
    status: r.status,
    notes: r.notes ?? undefined,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

@Injectable()
export class ProjectsService {
  constructor(private readonly db: Database) {}

  async list({ limit, offset }: PageQuery): Promise<Project[]> {
    const rows = await this.db
      .selectFrom('projects')
      .select(columns)
      .orderBy('created_at', 'desc')
      .orderBy('id')
      .limit(limit)
      .offset(offset)
      .execute();
    return rows.map(toProject);
  }

  async get(id: string): Promise<Project> {
    const row = await this.db
      .selectFrom('projects')
      .select(columns)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('project not found');
    return toProject(row);
  }

  /** Throws 404 unless the project exists (used by nested list routes). */
  async assertExists(id: string): Promise<void> {
    const row = await this.db
      .selectFrom('projects')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('project not found');
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const row = await this.db
      .insertInto('projects')
      .values({
        name: input.name,
        customer_name: input.customerName,
        address: input.address,
        location: input.location && pointSql(input.location),
        status: input.status,
        notes: input.notes,
      })
      .returning(columns)
      .executeTakeFirstOrThrow();
    return toProject(row);
  }

  async update(id: string, input: UpdateProjectInput): Promise<Project> {
    const set: UpdateObject<DB, 'projects'> = {
      name: input.name,
      customer_name: input.customerName,
      address: input.address,
      location:
        input.location === undefined
          ? undefined
          : input.location && pointSql(input.location),
      status: input.status,
      notes: input.notes,
    };
    const row = await this.db
      .updateTable('projects')
      .set(set)
      .where('id', '=', id)
      .returning(columns)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('project not found');
    return toProject(row);
  }

  /** Fails with 409 while sites or cameras still reference the project. */
  async remove(id: string): Promise<void> {
    const res = await this.db
      .deleteFrom('projects')
      .where('id', '=', id)
      .executeTakeFirst();
    if (res.numDeletedRows === 0n) {
      throw new NotFoundException('project not found');
    }
  }
}
