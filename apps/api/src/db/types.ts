import type {
  CameraPurpose,
  CameraStatus,
  CameraType,
  MountType,
  NetworkType,
  PhotoType,
  ProjectStatus,
  StructureType,
  UserRole,
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
  // 0004_survey_fields
  gps_accuracy_m: number | null;
  address: string | null;
  surveyed_at: ColumnType<
    Date | null,
    string | Date | null,
    string | Date | null
  >;
  surveyor_id: ColumnType<string | null, string | null, never>;
  brand: string | null;
  camera_count: Generated<number>;
  view_distance_m: number | null;
  purpose: CameraPurpose | null;
  structure_type: StructureType | null;
  pole_height_m: number | null;
  cabinet_distance_m: number | null;
  power_available: boolean | null;
  fiber_available: boolean | null;
  network_available: boolean | null;
  // 0005_camera_models_photos
  camera_model_id: string | null;
  // 0007_survey_detail
  cabinet_location: string | null;
  site_conditions: string | null;
  site_issues: string | null;
  // 0008_network_type (mount_type, poe, fiber_available and
  // network_available stay in the table but are no longer used)
  network_type: NetworkType | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CameraModelsTable {
  id: Generated<string>;
  brand: string;
  model: string;
  camera_type: CameraType;
  resolution_mp: number | null;
  active: Generated<boolean>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** Rows are inserted and deleted, never updated. */
export interface CameraPhotosTable {
  id: Generated<string>;
  camera_point_id: string;
  file_key: string;
  thumb_key: string;
  content_type: 'image/jpeg';
  size_bytes: number;
  width: number;
  height: number;
  uploaded_by: string | null;
  created_at: Timestamp;
  // 0006_photo_type_caption
  photo_type: Generated<PhotoType>;
  caption: string | null;
}

export interface UsersTable {
  id: Generated<string>;
  username: ColumnType<string, string, never>;
  display_name: string | null;
  /** Argon2id PHC string. Never selected into API responses. */
  password_hash: string;
  role: UserRole;
  is_active: Generated<boolean>;
  last_login_at: ColumnType<Date | null, never, Date>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface UserSessionsTable {
  id: Generated<string>;
  user_id: ColumnType<string, string, never>;
  created_at: Timestamp;
  expires_at: ColumnType<Date, Date, never>;
  revoked_at: ColumnType<Date | null, never, Date>;
}

export interface DB {
  projects: ProjectsTable;
  sites: SitesTable;
  camera_points: CameraPointsTable;
  camera_models: CameraModelsTable;
  camera_photos: CameraPhotosTable;
  users: UsersTable;
  user_sessions: UserSessionsTable;
}
