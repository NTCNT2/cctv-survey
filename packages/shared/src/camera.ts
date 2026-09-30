import { z } from 'zod';
import { CAMERA_STATUSES, CAMERA_TYPES, MOUNT_TYPES } from './enums.js';
import { latLngSchema } from './geo.js';

export const createCameraPointSchema = z.object({
  projectId: z.uuid(),
  /** Optional; must belong to the same project. */
  siteId: z.uuid().optional(),
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

const cam = createCameraPointSchema.shape;

/**
 * PATCH body: `null` clears an optional field (e.g. `siteId: null` detaches the
 * camera from its site). A camera cannot move to another project. Built
 * explicitly because `.partial()` would re-apply the `status` default.
 */
export const updateCameraPointSchema = z
  .object({
    siteId: cam.siteId.unwrap().nullable(),
    label: cam.label,
    type: cam.type,
    status: z.enum(CAMERA_STATUSES),
    location: cam.location,
    bearingDeg: cam.bearingDeg.unwrap().nullable(),
    fovDeg: cam.fovDeg.unwrap().nullable(),
    mountType: cam.mountType.unwrap().nullable(),
    mountHeightM: cam.mountHeightM.unwrap().nullable(),
    resolutionMp: cam.resolutionMp.unwrap().nullable(),
    lensMm: cam.lensMm.unwrap().nullable(),
    model: cam.model.unwrap().nullable(),
    poe: cam.poe.unwrap().nullable(),
    cableLengthM: cam.cableLengthM.unwrap().nullable(),
    notes: cam.notes.unwrap().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'at least one field is required');
export type UpdateCameraPointInput = z.infer<typeof updateCameraPointSchema>;

export interface CameraPoint extends CreateCameraPointInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}
