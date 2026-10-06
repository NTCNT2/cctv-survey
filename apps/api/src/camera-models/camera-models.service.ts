import type {
  CameraModel,
  CreateCameraModelInput,
  UpdateCameraModelInput,
} from '@cctv/shared';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql, type Selectable } from 'kysely';
import { Database } from '../db/database.js';
import type { CameraModelsTable } from '../db/types.js';

const columns = [
  'id',
  'brand',
  'model',
  'camera_type',
  'resolution_mp',
  'active',
  'created_at',
  'updated_at',
  // A scalar subquery also works in INSERT / UPDATE … RETURNING.
  sql<string>`(
    SELECT count(*) FROM camera_points
    WHERE camera_points.camera_model_id = camera_models.id
  )`.as('used_by'),
] as const;

type Row = Selectable<CameraModelsTable> & { used_by: string };

function toModel(r: Row): CameraModel {
  return {
    id: r.id,
    brand: r.brand,
    model: r.model,
    cameraType: r.camera_type,
    resolutionMp: r.resolution_mp ?? undefined,
    active: r.active,
    usedBy: Number(r.used_by),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

@Injectable()
export class CameraModelsService {
  constructor(private readonly db: Database) {}

  /** Models with this `active` value, or all of them. Sorted for dropdowns. */
  async list(active?: boolean): Promise<CameraModel[]> {
    let q = this.db.selectFrom('camera_models').select(columns);
    if (active !== undefined) q = q.where('active', '=', active);
    const rows = await q
      .orderBy(sql`lower(brand)`)
      .orderBy(sql`lower(model)`)
      .execute();
    return rows.map(toModel);
  }

  async create(input: CreateCameraModelInput): Promise<CameraModel> {
    const row = await this.db
      .insertInto('camera_models')
      .values({
        brand: input.brand,
        model: input.model,
        camera_type: input.cameraType,
        resolution_mp: input.resolutionMp,
        active: input.active,
      })
      .returning(columns)
      .executeTakeFirstOrThrow();
    return toModel(row);
  }

  /**
   * Editing a model never touches camera points: each point keeps the brand,
   * model, type and resolution that were copied when the model was chosen.
   */
  async update(
    id: string,
    input: UpdateCameraModelInput,
  ): Promise<CameraModel> {
    const row = await this.db
      .updateTable('camera_models')
      .set({
        brand: input.brand,
        model: input.model,
        camera_type: input.cameraType,
        resolution_mp: input.resolutionMp,
        active: input.active,
      })
      .where('id', '=', id)
      .returning(columns)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('camera model not found');
    return toModel(row);
  }

  /**
   * The values a camera point copies from its model. Only active models may
   * be chosen, except `keepIfLinkedTo`: a point that already uses a model
   * that was deactivated since may keep (re-save) it.
   */
  async snapshotFor(id: string, keepIfLinkedTo?: string) {
    const m = await this.db
      .selectFrom('camera_models')
      .select(['brand', 'model', 'camera_type', 'resolution_mp', 'active'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!m) throw new BadRequestException('cameraModelId does not exist');
    if (!m.active) {
      const linked =
        keepIfLinkedTo !== undefined &&
        (await this.db
          .selectFrom('camera_points')
          .select('id')
          .where('id', '=', keepIfLinkedTo)
          .where('camera_model_id', '=', id)
          .executeTakeFirst());
      if (!linked) throw new BadRequestException('camera model is inactive');
    }
    return {
      camera_model_id: id,
      brand: m.brand,
      model: m.model,
      type: m.camera_type,
      resolution_mp: m.resolution_mp,
    };
  }
}
