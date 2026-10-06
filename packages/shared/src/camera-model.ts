import { z } from 'zod';
import { CAMERA_TYPES, type CameraType } from './enums.js';

/**
 * Camera model master data (0005): what surveyors pick in Quick Add instead
 * of typing brand, model, type and resolution for every point. Managed by
 * admins; never deleted — `active: false` hides a model from new points.
 */
export const createCameraModelSchema = z.object({
  brand: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(100),
  cameraType: z.enum(CAMERA_TYPES),
  resolutionMp: z.number().positive().max(50).optional(),
  active: z.boolean().default(true),
});
export type CreateCameraModelInput = z.infer<typeof createCameraModelSchema>;

const m = createCameraModelSchema.shape;

/** PATCH body: `null` clears resolutionMp. */
export const updateCameraModelSchema = z
  .object({
    brand: m.brand,
    model: m.model,
    cameraType: m.cameraType,
    resolutionMp: m.resolutionMp.unwrap().nullable(),
    active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'at least one field is required');
export type UpdateCameraModelInput = z.infer<typeof updateCameraModelSchema>;

export interface CameraModel {
  id: string;
  brand: string;
  model: string;
  cameraType: CameraType;
  resolutionMp?: number;
  active: boolean;
  /** Camera points linked to this model. */
  usedBy: number;
  createdAt: string;
  updatedAt: string;
}
