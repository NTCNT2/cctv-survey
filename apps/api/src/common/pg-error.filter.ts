import {
  BadRequestException,
  Catch,
  ConflictException,
  type ArgumentsHost,
  type HttpException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import pg from 'pg';

/** Client-facing messages for named constraints in infra/db/migrations. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  sites_project_name_key: 'a site with this name already exists in the project',
  camera_points_project_label_key:
    'a camera with this label already exists in the project',
  sites_project_id_fkey: 'projectId does not exist',
  camera_points_project_id_fkey: 'projectId does not exist',
  camera_points_site_fk: 'siteId does not exist in this project',
  users_username_key: 'username already exists',
  camera_models_brand_model_key: 'this camera model already exists',
  camera_points_camera_model_id_fkey: 'cameraModelId does not exist',
  sites_boundary_check:
    'boundary polygon is invalid (self-intersecting or degenerate)',
};

const snakeToCamel = (s: string) =>
  s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/**
 * CHECK constraints are auto-named `<table>_<column>_check`; report the API
 * field name instead of the internal constraint name.
 */
function checkMessage(err: pg.DatabaseError): string {
  const known = err.constraint && CONSTRAINT_MESSAGES[err.constraint];
  if (known) return known;
  const prefix = `${err.table}_`;
  const c = err.constraint ?? '';
  if (err.table && c.startsWith(prefix) && c.endsWith('_check')) {
    const column = c.slice(prefix.length, -'_check'.length);
    if (column) return `invalid value for ${snakeToCamel(column)}`;
  }
  return 'invalid value';
}

/**
 * Maps PostgreSQL constraint errors to 4xx responses. Anything else falls
 * through to Nest's default handler (500, details logged, not returned).
 */
export function toHttpException(
  err: pg.DatabaseError,
): HttpException | undefined {
  const known = err.constraint && CONSTRAINT_MESSAGES[err.constraint];
  switch (err.code) {
    case '23505': // unique_violation
      return new ConflictException(known || 'duplicate value');
    case '23001': // restrict_violation (ON DELETE RESTRICT)
      return new ConflictException(
        'cannot delete: other records still reference it — delete those first',
      );
    case '23503': // foreign_key_violation
      return new BadRequestException(known || 'referenced record not found');
    case '23514': // check_violation
      return new BadRequestException(checkMessage(err));
    case '22P02': // invalid_text_representation (e.g. malformed uuid)
      return new BadRequestException('invalid identifier');
    case '22021': // character_not_in_repertoire (e.g. NUL byte in text)
    case '22001': // string_data_right_truncation
    case '22003': // numeric_value_out_of_range
      return new BadRequestException(
        'invalid characters or value out of range',
      );
    default:
      return undefined;
  }
}

@Catch(pg.DatabaseError)
export class PgErrorFilter extends BaseExceptionFilter {
  catch(err: pg.DatabaseError, host: ArgumentsHost) {
    super.catch(toHttpException(err) ?? err, host);
  }
}
