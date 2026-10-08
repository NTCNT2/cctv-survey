import { z } from 'zod';
import {
  CAMERA_PURPOSES,
  CAMERA_STATUSES,
  CAMERA_TYPES,
  type CameraType,
  MOUNT_TYPES,
  STRUCTURE_TYPES,
} from './enums.js';
import { latLngSchema } from './geo.js';

const cameraPointFields = z.object({
  projectId: z.uuid(),
  /** Optional; must belong to the same project (the survey area). */
  siteId: z.uuid().optional(),
  /** Point code, e.g. CCTV-001; unique per project. */
  label: z.string().trim().min(1).max(50),
  /**
   * Camera model from the master list (Quick Add). When set, the server copies
   * its brand, model, type and resolution onto the point (a snapshot: the
   * point keeps them if the model is later edited or deactivated).
   */
  cameraModelId: z.uuid().optional(),
  /** Required unless `cameraModelId` is given. */
  type: z.enum(CAMERA_TYPES).optional(),
  status: z.enum(CAMERA_STATUSES).default('surveyed'),
  location: latLngSchema,

  // --- Location / survey -------------------------------------------------
  /** GPS accuracy (radius in metres) when the position was recorded. */
  gpsAccuracyM: z.number().min(0).max(10000).optional(),
  address: z.string().trim().max(500).optional(),
  /** When the point was surveyed (ISO 8601); the server uses "now" if absent. */
  surveyedAt: z.iso.datetime({ offset: true }).optional(),

  // --- Camera --------------------------------------------------------------
  brand: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  resolutionMp: z.number().positive().max(50).optional(),
  lensMm: z.number().positive().max(100).optional(),
  /** Cameras installed at this point. */
  cameraCount: z.number().int().min(1).max(64).default(1),
  /** Viewing direction in degrees clockwise from north (0–359). */
  bearingDeg: z.number().min(0).lt(360).optional(),
  /** Horizontal field of view in degrees. */
  fovDeg: z.number().gt(0).max(360).optional(),
  /** Useful viewing distance in metres (with fovDeg: the FOV on the map). */
  viewDistanceM: z.number().gt(0).max(1000).optional(),
  purpose: z.enum(CAMERA_PURPOSES).optional(),
  mountType: z.enum(MOUNT_TYPES).optional(),
  /** Installation height of the camera in metres. */
  mountHeightM: z.number().min(0).max(100).optional(),

  // --- Structure / infrastructure -----------------------------------------
  structureType: z.enum(STRUCTURE_TYPES).optional(),
  poleHeightM: z.number().min(0).max(50).optional(),
  cabinetDistanceM: z.number().min(0).max(5000).optional(),
  /** Estimated cable length in metres. */
  cableLengthM: z.number().min(0).max(1000).optional(),
  poe: z.boolean().optional(),
  powerAvailable: z.boolean().optional(),
  fiberAvailable: z.boolean().optional(),
  networkAvailable: z.boolean().optional(),
  /** Where the control cabinet / cable gathering point is (0007). */
  cabinetLocation: z.string().trim().max(500).optional(),

  // --- Site (0007) ---------------------------------------------------------
  /** Site conditions and obstacles at the installation point. */
  siteConditions: z.string().trim().max(2000).optional(),
  /** Additional requirements or problems found on site. */
  siteIssues: z.string().trim().max(2000).optional(),

  notes: z.string().max(5000).optional(),
});

export const createCameraPointSchema = cameraPointFields.refine(
  (v) => v.type !== undefined || v.cameraModelId !== undefined,
  { path: ['type'], message: 'type is required without cameraModelId' },
);
export type CreateCameraPointInput = z.infer<typeof createCameraPointSchema>;

const cam = cameraPointFields.shape;

/**
 * PATCH body: every field optional, `null` clears an optional field. Built
 * explicitly (not `.partial()`): zod 4 still applies `.default()` inside a
 * partial, which would silently reset `status` / `cameraCount` on every update.
 */
export const updateCameraPointSchema = z
  .object({
    siteId: cam.siteId.unwrap().nullable(),
    label: cam.label,
    /** `null` unlinks the model; the point keeps its brand / model / type. */
    cameraModelId: cam.cameraModelId.unwrap().nullable(),
    type: cam.type.unwrap(),
    status: z.enum(CAMERA_STATUSES),
    location: cam.location,
    gpsAccuracyM: cam.gpsAccuracyM.unwrap().nullable(),
    address: cam.address.unwrap().nullable(),
    surveyedAt: cam.surveyedAt.unwrap().nullable(),
    brand: cam.brand.unwrap().nullable(),
    model: cam.model.unwrap().nullable(),
    resolutionMp: cam.resolutionMp.unwrap().nullable(),
    lensMm: cam.lensMm.unwrap().nullable(),
    cameraCount: z.number().int().min(1).max(64),
    bearingDeg: cam.bearingDeg.unwrap().nullable(),
    fovDeg: cam.fovDeg.unwrap().nullable(),
    viewDistanceM: cam.viewDistanceM.unwrap().nullable(),
    purpose: cam.purpose.unwrap().nullable(),
    mountType: cam.mountType.unwrap().nullable(),
    mountHeightM: cam.mountHeightM.unwrap().nullable(),
    structureType: cam.structureType.unwrap().nullable(),
    poleHeightM: cam.poleHeightM.unwrap().nullable(),
    cabinetDistanceM: cam.cabinetDistanceM.unwrap().nullable(),
    cableLengthM: cam.cableLengthM.unwrap().nullable(),
    poe: cam.poe.unwrap().nullable(),
    powerAvailable: cam.powerAvailable.unwrap().nullable(),
    fiberAvailable: cam.fiberAvailable.unwrap().nullable(),
    networkAvailable: cam.networkAvailable.unwrap().nullable(),
    cabinetLocation: cam.cabinetLocation.unwrap().nullable(),
    siteConditions: cam.siteConditions.unwrap().nullable(),
    siteIssues: cam.siteIssues.unwrap().nullable(),
    notes: cam.notes.unwrap().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'at least one field is required');
export type UpdateCameraPointInput = z.infer<typeof updateCameraPointSchema>;

export interface CameraPoint extends Omit<CreateCameraPointInput, 'type'> {
  id: string;
  type: CameraType;
  /** Whether the linked model is still offered for new points. */
  cameraModelActive?: boolean;
  /**
   * The linked model as it is in the master list now. brand / model / type /
   * resolutionMp above are the point's own copy from when it was chosen.
   */
  cameraModel?: {
    id: string;
    brand: string;
    model: string;
    cameraType: CameraType;
    resolutionMp?: number;
    active: boolean;
  };
  /** Field photos of this point. */
  photoCount: number;
  /** The user who recorded the point (set by the server from the session). */
  surveyorId?: string;
  /** Display name (or username) of that user. */
  surveyorName?: string;
  createdAt: string;
  updatedAt: string;
}
