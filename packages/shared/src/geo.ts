import { z } from 'zod';

/** WGS84 coordinate (SRID 4326), stored in PostGIS as geometry(Point, 4326). */
export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof latLngSchema>;

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
