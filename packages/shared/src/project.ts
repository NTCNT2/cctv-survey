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

export interface Project extends CreateProjectInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}
