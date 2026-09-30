import { z } from 'zod';
import { latLngPolygonSchema, latLngSchema } from './geo.js';

/** A surveyed building / area / floor within a project. */
export const createSiteSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500).optional(),
  /** Map marker for the site. */
  location: latLngSchema.optional(),
  /** Outline of the site area, stored as geometry(Polygon, 4326). */
  boundary: latLngPolygonSchema.optional(),
  notes: z.string().max(5000).optional(),
});
export type CreateSiteInput = z.infer<typeof createSiteSchema>;

export interface Site extends CreateSiteInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}
