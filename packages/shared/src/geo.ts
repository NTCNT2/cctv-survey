import { z } from 'zod';

/** WGS84 coordinate (SRID 4326), stored in PostGIS as geometry(Point, 4326). */
export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof latLngSchema>;

/**
 * Simple polygon (outer ring only) as a list of vertices, stored in PostGIS as
 * geometry(Polygon, 4326). The ring is closed server-side — do not repeat the first point.
 */
export const latLngPolygonSchema = z.array(latLngSchema).min(3).max(1000);
export type LatLngPolygon = z.infer<typeof latLngPolygonSchema>;

/** GeoJSON Point — note GeoJSON order is [lng, lat]. */
export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [lng: number, lat: number];
}

export function toGeoJsonPoint({ lat, lng }: LatLng): GeoJsonPoint {
  return { type: 'Point', coordinates: [lng, lat] };
}

export function fromGeoJsonPoint(point: GeoJsonPoint): LatLng {
  const [lng, lat] = point.coordinates;
  return { lat, lng };
}
