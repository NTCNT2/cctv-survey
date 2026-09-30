import type { LatLng, LatLngPolygon } from '@cctv/shared';
import { sql, type RawBuilder } from 'kysely';

// All values are bound parameters; nothing is interpolated into the SQL text.
// PostGIS order is (x, y) = (lng, lat).

export function pointSql(p: LatLng): RawBuilder<string> {
  return sql<string>`ST_SetSRID(ST_MakePoint(${p.lng}::float8, ${p.lat}::float8), 4326)`;
}

export function polygonSql(ring: LatLngPolygon): RawBuilder<string> {
  const geojson = JSON.stringify({
    type: 'Polygon',
    coordinates: [closeRing(ring).map((p) => [p.lng, p.lat])],
  });
  return sql<string>`ST_SetSRID(ST_GeomFromGeoJSON(${geojson}::text), 4326)`;
}

/** Appends the first vertex unless the caller already closed the ring. */
export function closeRing(ring: LatLngPolygon): LatLngPolygon {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first.lat === last.lat && first.lng === last.lng
    ? ring
    : [...ring, first];
}

/** Outer ring of a GeoJSON Polygon as vertices, without the closing point. */
export function ringFromGeoJson(polygon: {
  coordinates: number[][][];
}): LatLngPolygon {
  const ring = polygon.coordinates[0].map(([lng, lat]) => ({ lat, lng }));
  return ring.slice(0, -1);
}

/** Point columns come back as separate lat/lng selections; both null means unset. */
export function toLatLng(
  lat: number | null,
  lng: number | null,
): LatLng | undefined {
  return lat === null || lng === null ? undefined : { lat, lng };
}
