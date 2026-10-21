import {
  createCameraPointSchema,
  createProjectSchema,
  updateProjectSchema,
} from '@cctv/shared';
import { describe, expect, it } from 'vitest';
import {
  apiIssuesToFieldErrors,
  num,
  safeNextPath,
  text,
  validate,
} from './form';

describe('safeNextPath (open-redirect guard)', () => {
  it.each([
    ['/projects/abc', '/projects/abc'],
    ['/projects?x=1', '/projects?x=1'],
    [null, '/dashboard'],
    ['', '/dashboard'],
    ['projects', '/dashboard'],
    ['//evil.example/x', '/dashboard'],
    ['/\\evil.example', '/dashboard'],
    ['https://evil.example', '/dashboard'],
    ['javascript:alert(1)', '/dashboard'],
    ['/login?next=/x', '/dashboard'],
    ['/projects\n', '/dashboard'],
  ])('%s -> %s', (input, out) => {
    expect(safeNextPath(input)).toBe(out);
  });
});

describe('input helpers', () => {
  it('text() trims and maps blank to the given empty value', () => {
    expect(text('  a ', undefined)).toBe('a');
    expect(text('   ', undefined)).toBeUndefined();
    expect(text('', null)).toBeNull();
  });

  it('num() parses decimals, accepts a comma, flags junk as NaN', () => {
    expect(num('13.7563', undefined)).toBe(13.7563);
    expect(num('13,5', undefined)).toBe(13.5);
    expect(num('-0.5', undefined)).toBe(-0.5);
    expect(num('', null)).toBeNull();
    expect(num('12abc', undefined)).toBeNaN();
    expect(num('1e3', undefined)).toBeNaN();
  });
});

describe('validate (shared schemas, Thai messages)', () => {
  it('reports nested errors on the top-level field, in Thai', () => {
    const r = validate(createProjectSchema, {
      name: ' ',
      location: { lat: 200, lng: 100 },
    });
    expect(r.errors).toEqual({
      name: 'กรุณากรอกข้อมูล',
      location: 'ต้องไม่เกิน 90',
    });
  });

  it('flags non-numeric input', () => {
    const r = validate(createCameraPointSchema, {
      projectId: '3f1c2a9e-8b7d-4c21-9f3e-2a1b0c9d8e7f',
      label: 'C1',
      type: 'dome',
      location: { lat: Number.NaN, lng: 100 },
      bearingDeg: 360,
    });
    expect(r.errors).toMatchObject({
      location: 'ต้องเป็นตัวเลข',
      bearingDeg: 'ต้องน้อยกว่า 360',
    });
  });

  it('translates the shared custom messages', () => {
    expect(validate(updateProjectSchema, {}).errors).toEqual({
      _form: 'กรุณาแก้ไขอย่างน้อยหนึ่งช่อง',
    });
  });

  it('keeps clearing values (null) for PATCH bodies', () => {
    expect(
      validate(updateProjectSchema, { customerName: null, location: null })
        .data,
    ).toEqual({ customerName: null, location: null });
  });

  it('maps API issues to fields', () => {
    expect(
      apiIssuesToFieldErrors([
        { path: 'location.lng', message: 'x' },
        { path: 'name', message: 'y' },
      ]),
    ).toEqual({ location: 'x', name: 'y' });
  });
});
