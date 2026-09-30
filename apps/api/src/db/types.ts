import type {
  CameraStatus,
  CameraType,
  MountType,
  ProjectStatus,
} from '@cctv/shared';
import type { ColumnType, Generated } from 'kysely';

/**
 * Kysely table types for infra/db/migrations. Keep in sync with the SQL.
 *
 * Geometry columns are never read raw: selects go through ST_X / ST_Y /
 * ST_AsGeoJSON and writes through the helpers in ./geo.ts.
 */
type Geometry = ColumnType<string, string, string>;
/** Set by column defaults and the updated_at trigger — never written by the API. */
type Timestamp = ColumnType<Date, never, never>;

export interface ProjectsTable {
  id: Generated<string>;
  name: string;
  customer_name: string | null;
  address: string | null;
  location: Geometry | null;
  status: Generated<ProjectStatus>;
  notes: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SitesTable {
  id: Generated<string>;
  project_id: ColumnType<string, string, never>;
  name: string;
  address: string | null;
  location: Geometry | null;
  boundary: Geometry | null;
  notes: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CameraPointsTable {
  id: Generated<string>;
  project_id: ColumnType<string, string, never>;
  site_id: string | null;
  label: string;
  type: CameraType;
  status: Generated<CameraStatus>;
  location: Geometry;
  bearing_deg: number | null;
  fov_deg: number | null;
  mount_type: MountType | null;
  mount_height_m: number | null;
  resolution_mp: number | null;
  lens_mm: number | null;
  model: string | null;
  poe: boolean | null;
  cable_length_m: number | null;
  notes: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface DB {
  projects: ProjectsTable;
  sites: SitesTable;
  camera_points: CameraPointsTable;
}
