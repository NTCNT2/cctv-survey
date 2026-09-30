import { z } from 'zod';
import { PROJECT_STATUSES } from './enums.js';
import { latLngSchema } from './geo.js';

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  customerName: z.string().trim().max(200).optional(),
  address: z.string().trim().max(500).optional(),
  location: latLngSchema.optional(),
  status: z.enum(PROJECT_STATUSES).default('draft'),
  notes: z.string().max(5000).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * PATCH body: every field optional, `null` clears an optional field.
 * Built explicitly (not `.partial()`): zod 4 still applies `.default()` inside a
 * partial, which would silently reset `status` on every update.
 */
export const updateProjectSchema = z
  .object({
    name: createProjectSchema.shape.name,
    customerName: createProjectSchema.shape.customerName.unwrap().nullable(),
    address: createProjectSchema.shape.address.unwrap().nullable(),
    location: latLngSchema.nullable(),
    status: z.enum(PROJECT_STATUSES),
    notes: createProjectSchema.shape.notes.unwrap().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'at least one field is required');
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export interface Project extends CreateProjectInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}
