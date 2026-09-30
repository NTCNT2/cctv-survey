import type {
  CameraPoint,
  CreateCameraPointInput,
  UpdateCameraPointInput,
} from '@cctv/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { sql, type Selectable, type UpdateObject } from 'kysely';
import { Database } from '../db/database.js';
import { pointSql } from '../db/geo.js';
import type { DB, CameraPointsTable } from '../db/types.js';

const columns = [
  'id',
  'project_id',
  'site_id',
  'label',
  'type',
  'status',
  'bearing_deg',
  'fov_deg',
  'mount_type',
  'mount_height_m',
  'resolution_mp',
  'lens_mm',
  'model',
  'poe',
  'cable_length_m',
  'notes',
  'created_at',
  'updated_at',
  sql<number>`ST_Y(location)`.as('lat'),
  sql<number>`ST_X(location)`.as('lng'),
] as const;

type Row = Omit<Selectable<CameraPointsTable>, 'location'> & {
  lat: number;
  lng: number;
};

function toCamera(r: Row): CameraPoint {
  return {
    id: r.id,
    projectId: r.project_id,
    siteId: r.site_id ?? undefined,
    label: r.label,
    type: r.type,
    status: r.status,
    location: { lat: r.lat, lng: r.lng },
    bearingDeg: r.bearing_deg ?? undefined,
    fovDeg: r.fov_deg ?? undefined,
    mountType: r.mount_type ?? undefined,
    mountHeightM: r.mount_height_m ?? undefined,
    resolutionMp: r.resolution_mp ?? undefined,
    lensMm: r.lens_mm ?? undefined,
    model: r.model ?? undefined,
    poe: r.poe ?? undefined,
    cableLengthM: r.cable_length_m ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

@Injectable()
export class CamerasService {
  constructor(private readonly db: Database) {}

  async listByProject(
    projectId: string,
    siteId?: string,
  ): Promise<CameraPoint[]> {
    let q = this.db
      .selectFrom('camera_points')
      .select(columns)
      .where('project_id', '=', projectId);
    if (siteId) q = q.where('site_id', '=', siteId);
    const rows = await q.orderBy('label').execute();
    return rows.map(toCamera);
  }

  async get(id: string): Promise<CameraPoint> {
    const row = await this.db
      .selectFrom('camera_points')
      .select(columns)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('camera point not found');
    return toCamera(row);
  }

  async create(input: CreateCameraPointInput): Promise<CameraPoint> {
    const row = await this.db
      .insertInto('camera_points')
      .values({
        project_id: input.projectId,
        site_id: input.siteId,
        label: input.label,
        type: input.type,
        status: input.status,
        location: pointSql(input.location),
        bearing_deg: input.bearingDeg,
        fov_deg: input.fovDeg,
        mount_type: input.mountType,
        mount_height_m: input.mountHeightM,
        resolution_mp: input.resolutionMp,
        lens_mm: input.lensMm,
        model: input.model,
        poe: input.poe,
        cable_length_m: input.cableLengthM,
        notes: input.notes,
      })
      .returning(columns)
      .executeTakeFirstOrThrow();
    return toCamera(row);
  }

  async update(
    id: string,
    input: UpdateCameraPointInput,
  ): Promise<CameraPoint> {
    const set: UpdateObject<DB, 'camera_points'> = {
      site_id: input.siteId,
      label: input.label,
      type: input.type,
      status: input.status,
      location: input.location && pointSql(input.location),
      bearing_deg: input.bearingDeg,
      fov_deg: input.fovDeg,
      mount_type: input.mountType,
      mount_height_m: input.mountHeightM,
      resolution_mp: input.resolutionMp,
      lens_mm: input.lensMm,
      model: input.model,
      poe: input.poe,
      cable_length_m: input.cableLengthM,
      notes: input.notes,
    };
    const row = await this.db
      .updateTable('camera_points')
      .set(set)
      .where('id', '=', id)
      .returning(columns)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('camera point not found');
    return toCamera(row);
  }

  async remove(id: string): Promise<void> {
    const res = await this.db
      .deleteFrom('camera_points')
      .where('id', '=', id)
      .executeTakeFirst();
    if (res.numDeletedRows === 0n) {
      throw new NotFoundException('camera point not found');
    }
  }
}
