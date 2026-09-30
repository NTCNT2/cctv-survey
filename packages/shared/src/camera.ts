import { z } from 'zod';
import { CAMERA_STATUSES, CAMERA_TYPES, MOUNT_TYPES } from './enums.js';
import { latLngSchema } from './geo.js';

export const createCameraPointSchema = z.object({
  projectId: z.string().min(1),
  /** Optional; must belong to the same project. */
  siteId: z.string().min(1).optional(),
  label: z.string().trim().min(1).max(50),
  type: z.enum(CAMERA_TYPES),
  status: z.enum(CAMERA_STATUSES).default('proposed'),
  location: latLngSchema,
  /** Viewing direction in degrees clockwise from north (0–359). */
  bearingDeg: z.number().min(0).lt(360).optional(),
  /** Horizontal field of view in degrees. */
  fovDeg: z.number().gt(0).max(360).optional(),
  mountType: z.enum(MOUNT_TYPES).optional(),
  mountHeightM: z.number().min(0).max(100).optional(),
  resolutionMp: z.number().positive().max(50).optional(),
  lensMm: z.number().positive().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  poe: z.boolean().optional(),
  cableLengthM: z.number().min(0).max(1000).optional(),
  notes: z.string().max(5000).optional(),
});
export type CreateCameraPointInput = z.infer<typeof createCameraPointSchema>;

export interface CameraPoint extends CreateCameraPointInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}
