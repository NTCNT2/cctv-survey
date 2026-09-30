import { closeRing, ringFromGeoJson, toLatLng } from './geo.js';

describe('geo helpers', () => {
  const ring = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 1, lng: 1 },
  ];

  it('closes an open ring once', () => {
    expect(closeRing(ring)).toEqual([...ring, ring[0]]);
    expect(closeRing([...ring, ring[0]])).toEqual([...ring, ring[0]]);
  });

  it('reads GeoJSON [lng, lat] back into an open ring', () => {
    expect(
      ringFromGeoJson({
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      }),
    ).toEqual(ring);
  });

  it('treats null coordinates as unset', () => {
    expect(toLatLng(null, null)).toBeUndefined();
    expect(toLatLng(13.75, 100.5)).toEqual({ lat: 13.75, lng: 100.5 });
  });
});
