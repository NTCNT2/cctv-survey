import type {
  CameraPoint,
  CreateCameraPointInput,
  UpdateCameraPointInput,
} from '@cctv/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { CameraModelsService } from '../camera-models/camera-models.service.js';
import { sql, type Selectable, type UpdateObject } from 'kysely';
import { Database } from '../db/database.js';
import { pointSql } from '../db/geo.js';
import type { DB, CameraPointsTable } from '../db/types.js';
import { PhotoStorage } from '../photos/photo-storage.js';

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
  'gps_accuracy_m',
  'address',
  'surveyed_at',
  'surveyor_id',
  'brand',
  'camera_count',
  'view_distance_m',
  'purpose',
  'structure_type',
  'pole_height_m',
  'cabinet_distance_m',
  'power_available',
  'fiber_available',
  'network_available',
  'camera_model_id',
  'cabinet_location',
  'site_conditions',
  'site_issues',
  'created_at',
  'updated_at',
  sql<number>`ST_Y(location)`.as('lat'),
  sql<number>`ST_X(location)`.as('lng'),
  // A scalar subquery also works in INSERT / UPDATE … RETURNING.
  sql<string | null>`(
    SELECT coalesce(display_name, username) FROM users
    WHERE users.id = camera_points.surveyor_id
  )`.as('surveyor_name'),
  sql<boolean | null>`(
    SELECT active FROM camera_models
    WHERE camera_models.id = camera_points.camera_model_id
  )`.as('camera_model_active'),
  sql<ModelJson | null>`(
    SELECT json_build_object(
      'id', m.id, 'brand', m.brand, 'model', m.model,
      'cameraType', m.camera_type, 'resolutionMp', m.resolution_mp,
      'active', m.active)
    FROM camera_models m WHERE m.id = camera_points.camera_model_id
  )`.as('camera_model'),
  sql<string>`(
    SELECT count(*) FROM camera_photos
    WHERE camera_photos.camera_point_id = camera_points.id
  )`.as('photo_count'),
] as const;

type ModelJson = Omit<
  NonNullable<CameraPoint['cameraModel']>,
  'resolutionMp'
> & {
  resolutionMp: number | null;
};

type Row = Omit<Selectable<CameraPointsTable>, 'location'> & {
  lat: number;
  lng: number;
  surveyor_name: string | null;
  camera_model_active: boolean | null;
  camera_model: ModelJson | null;
  photo_count: string;
};

function toCamera(r: Row): CameraPoint {
  return {
    id: r.id,
    projectId: r.project_id,
    siteId: r.site_id ?? undefined,
    label: r.label,
    cameraModelId: r.camera_model_id ?? undefined,
    cameraModelActive: r.camera_model_active ?? undefined,
    cameraModel: r.camera_model
      ? {
          ...r.camera_model,
          resolutionMp: r.camera_model.resolutionMp ?? undefined,
        }
      : undefined,
    photoCount: Number(r.photo_count),
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
    gpsAccuracyM: r.gps_accuracy_m ?? undefined,
    address: r.address ?? undefined,
    surveyedAt: r.surveyed_at?.toISOString(),
    surveyorId: r.surveyor_id ?? undefined,
    surveyorName: r.surveyor_name ?? undefined,
    brand: r.brand ?? undefined,
    cameraCount: r.camera_count,
    viewDistanceM: r.view_distance_m ?? undefined,
    purpose: r.purpose ?? undefined,
    structureType: r.structure_type ?? undefined,
    poleHeightM: r.pole_height_m ?? undefined,
    cabinetDistanceM: r.cabinet_distance_m ?? undefined,
    powerAvailable: r.power_available ?? undefined,
    fiberAvailable: r.fiber_available ?? undefined,
    networkAvailable: r.network_available ?? undefined,
    cabinetLocation: r.cabinet_location ?? undefined,
    siteConditions: r.site_conditions ?? undefined,
    siteIssues: r.site_issues ?? undefined,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

@Injectable()
export class CamerasService {
  constructor(
    private readonly db: Database,
    private readonly models: CameraModelsService,
    private readonly photos: PhotoStorage,
  ) {}

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

  /**
   * `surveyorId` is the signed-in user (never taken from the body);
   * `surveyedAt` defaults to now when the client does not send one.
   * With `cameraModelId`, brand / model / type / resolution come from the
   * (active) model, whatever the body says.
   */
  async create(
    input: CreateCameraPointInput,
    surveyorId: string,
  ): Promise<CameraPoint> {
    const snap = input.cameraModelId
      ? await this.models.snapshotFor(input.cameraModelId)
      : undefined;
    // The schema requires `type` when there is no model.
    const type = snap?.type ?? input.type;
    if (!type) throw new Error('type missing after validation');
    const row = await this.db
      .insertInto('camera_points')
      .values({
        project_id: input.projectId,
        site_id: input.siteId,
        label: input.label,
        type,
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
        gps_accuracy_m: input.gpsAccuracyM,
        address: input.address,
        surveyed_at: input.surveyedAt ?? new Date(),
        surveyor_id: surveyorId,
        brand: input.brand,
        camera_count: input.cameraCount,
        view_distance_m: input.viewDistanceM,
        purpose: input.purpose,
        structure_type: input.structureType,
        pole_height_m: input.poleHeightM,
        cabinet_distance_m: input.cabinetDistanceM,
        power_available: input.powerAvailable,
        fiber_available: input.fiberAvailable,
        network_available: input.networkAvailable,
        cabinet_location: input.cabinetLocation,
        site_conditions: input.siteConditions,
        site_issues: input.siteIssues,
        ...(snap && {
          camera_model_id: snap.camera_model_id,
          brand: snap.brand,
          model: snap.model,
          resolution_mp: snap.resolution_mp,
        }),
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
      gps_accuracy_m: input.gpsAccuracyM,
      address: input.address,
      surveyed_at: input.surveyedAt,
      brand: input.brand,
      camera_count: input.cameraCount,
      view_distance_m: input.viewDistanceM,
      purpose: input.purpose,
      structure_type: input.structureType,
      pole_height_m: input.poleHeightM,
      cabinet_distance_m: input.cabinetDistanceM,
      power_available: input.powerAvailable,
      fiber_available: input.fiberAvailable,
      network_available: input.networkAvailable,
      cabinet_location: input.cabinetLocation,
      site_conditions: input.siteConditions,
      site_issues: input.siteIssues,
      camera_model_id: input.cameraModelId,
    };
    // A (new) model overrides brand / model / type / resolution. A point may
    // keep a model that has been deactivated since it was chosen.
    if (input.cameraModelId) {
      const snap = await this.models.snapshotFor(input.cameraModelId, id);
      Object.assign(set, snap);
    }
    const row = await this.db
      .updateTable('camera_points')
      .set(set)
      .where('id', '=', id)
      .returning(columns)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('camera point not found');
    return toCamera(row);
  }

  /** Photo rows go with the point (ON DELETE CASCADE); then their files. */
  async remove(id: string): Promise<void> {
    const files = await this.db.transaction().execute(async (trx) => {
      const photos = await trx
        .selectFrom('camera_photos')
        .select(['file_key', 'thumb_key'])
        .where('camera_point_id', '=', id)
        .forUpdate()
        .execute();
      const res = await trx
        .deleteFrom('camera_points')
        .where('id', '=', id)
        .executeTakeFirst();
      if (res.numDeletedRows === 0n) {
        throw new NotFoundException('camera point not found');
      }
      return photos.flatMap((p) => [p.file_key, p.thumb_key]);
    });
    await this.photos.remove(...files);
  }
}
