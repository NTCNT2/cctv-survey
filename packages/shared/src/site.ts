import { z } from 'zod';
import { latLngPolygonSchema, latLngSchema } from './geo.js';

/** A surveyed building / area / floor within a project. */
export const createSiteSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500).optional(),
  /** Map marker for the site. */
  location: latLngSchema.optional(),
  /** Outline of the site area, stored as geometry(Polygon, 4326). */
  boundary: latLngPolygonSchema.optional(),
  notes: z.string().max(5000).optional(),
});
export type CreateSiteInput = z.infer<typeof createSiteSchema>;

/** PATCH body: `null` clears an optional field. A site cannot move to another project. */
export const updateSiteSchema = z
  .object({
    name: createSiteSchema.shape.name,
    address: createSiteSchema.shape.address.unwrap().nullable(),
    location: latLngSchema.nullable(),
    boundary: latLngPolygonSchema.nullable(),
    notes: createSiteSchema.shape.notes.unwrap().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'at least one field is required');
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;

export interface Site extends CreateSiteInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}
