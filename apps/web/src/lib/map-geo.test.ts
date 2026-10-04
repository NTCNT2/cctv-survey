import { describe, expect, it } from 'vitest';
import {
  directionsUrl,
  distanceM,
  initialView,
  metersPerPixel,
  overlapping,
  POINT_ZOOM,
  PROJECT_ZOOM,
  THAILAND_VIEW,
} from './map-geo';

describe('distanceM', () => {
  it('is zero for the same point and symmetric', () => {
    const a = { lat: 13.7563, lng: 100.5018 };
    const b = { lat: 13.7401, lng: 100.5602 };
    expect(distanceM(a, a)).toBe(0);
    expect(distanceM(a, b)).toBeCloseTo(distanceM(b, a), 6);
  });

  it('matches known distances (geographic, not pixels)', () => {
    // 0.001° of latitude ≈ 111.2 m everywhere.
    expect(
      distanceM({ lat: 13, lng: 100 }, { lat: 13.001, lng: 100 }),
    ).toBeCloseTo(111.2, 0);
    // Bangkok (Democracy Monument) → Chiang Mai (Tha Phae Gate) ≈ 582 km.
    const km =
      distanceM(
        { lat: 13.7567, lng: 100.5018 },
        { lat: 18.7877, lng: 98.9937 },
      ) / 1000;
    expect(km).toBeGreaterThan(575);
    expect(km).toBeLessThan(590);
  });
});

describe('overlapping', () => {
  const pts = [
    { id: 'a', location: { lat: 13.74, lng: 100.56 } },
    { id: 'b', location: { lat: 13.74003, lng: 100.56 } }, // ≈ 3 m north
    { id: 'c', location: { lat: 13.75, lng: 100.56 } }, // ≈ 1.1 km
  ];

  it('groups points a few metres apart when zoomed out', () => {
    expect(overlapping(pts, pts[0], 14)).toEqual(['a', 'b']);
  });

  it('separates them when zoomed in', () => {
    expect(metersPerPixel(13.74, 21)).toBeLessThan(0.1);
    expect(overlapping(pts, pts[0], 21)).toEqual(['a']);
  });
});

describe('initialView', () => {
  const cam = (lat: number, lng: number) => ({ location: { lat, lng } });

  it('frames existing cameras first', () => {
    expect(
      initialView([cam(13.7, 100.5), cam(13.8, 100.6)], { lat: 1, lng: 2 }),
    ).toEqual({
      kind: 'bounds',
      points: [
        { lat: 13.7, lng: 100.5 },
        { lat: 13.8, lng: 100.6 },
      ],
    });
    expect(initialView([cam(13.7, 100.5)])).toEqual({
      kind: 'center',
      center: { lat: 13.7, lng: 100.5 },
      zoom: POINT_ZOOM,
    });
  });

  it('then the project location, then Thailand', () => {
    expect(initialView([], { lat: 16.4, lng: 101.1 })).toEqual({
      kind: 'center',
      center: { lat: 16.4, lng: 101.1 },
      zoom: PROJECT_ZOOM,
    });
    expect(initialView([])).toEqual({ kind: 'center', ...THAILAND_VIEW });
  });
});

it('builds a keyless directions link', () => {
  expect(directionsUrl({ lat: 13.74, lng: 100.56 })).toBe(
    'https://www.google.com/maps/dir/?api=1&destination=13.74,100.56',
  );
});
