import pg from 'pg';
import { toHttpException } from './pg-error.filter.js';

function pgError(code: string, constraint?: string, table?: string) {
  const err = new pg.DatabaseError('boom', 0, 'error');
  err.code = code;
  err.constraint = constraint;
  err.table = table;
  return err;
}

describe('toHttpException', () => {
  it.each([
    ['23505', 'camera_points_project_label_key', 409, 'label already exists'],
    ['23001', undefined, 409, 'cannot delete'],
    ['23503', 'camera_points_site_fk', 400, 'siteId does not exist'],
    ['22P02', undefined, 400, 'invalid identifier'],
    ['22021', undefined, 400, 'invalid characters'],
    ['22001', undefined, 400, 'invalid characters'],
    ['22003', undefined, 400, 'out of range'],
  ])('%s -> %i', (code, constraint, status, text) => {
    const ex = toHttpException(pgError(code, constraint));
    expect(ex?.getStatus()).toBe(status);
    expect(JSON.stringify(ex?.getResponse())).toContain(text);
  });

  it.each([
    ['sites_boundary_check', 'sites', 'boundary polygon is invalid'],
    [
      'camera_points_bearing_deg_check',
      'camera_points',
      'invalid value for bearingDeg',
    ],
    ['projects_location_check', 'projects', 'invalid value for location'],
    ['weird_constraint', 'projects', 'invalid value'],
  ])(
    '23514 %s does not leak the constraint name',
    (constraint, table, text) => {
      const body = JSON.stringify(
        toHttpException(pgError('23514', constraint, table))?.getResponse(),
      );
      expect(body).toContain(text);
      if (constraint !== 'sites_boundary_check') {
        expect(body).not.toContain(constraint);
      }
    },
  );

  it('leaves unknown errors to the default 500 handler', () => {
    expect(toHttpException(pgError('57014'))).toBeUndefined();
  });
});
