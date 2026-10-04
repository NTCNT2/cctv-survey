/** Map helpers shared by the Google and Leaflet survey maps (no map SDK). */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Thailand, whole country in view: the start when nothing else is known. */
export const THAILAND_VIEW = { center: { lat: 13.2, lng: 101.0 }, zoom: 6 };
/** Zoom for one point (a camera, the device position). */
export const POINT_ZOOM = 18;
/** Zoom for a project location without cameras. */
export const PROJECT_ZOOM = 16;
/** Markers closer than this on screen are hard to tap apart. */
export const OVERLAP_PX = 28;

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ground metres per screen pixel in Web Mercator (256 px tiles). */
export function metersPerPixel(lat: number, zoom: number): number {
  return (156_543.033_92 * Math.cos(rad(lat))) / 2 ** zoom;
}

/**
 * Points drawn within OVERLAP_PX of `target` at `zoom` (target included),
 * nearest first. One id means the tap is unambiguous.
 */
export function overlapping<T extends { id: string; location: LatLng }>(
  points: T[],
  target: T,
  zoom: number,
  px = OVERLAP_PX,
): string[] {
  const mpp = metersPerPixel(target.location.lat, zoom);
  return points
    .map((p) => ({ id: p.id, d: distanceM(target.location, p.location) / mpp }))
    .filter((p) => p.d < px)
    .sort((a, b) => a.d - b.d)
    .map((p) => p.id);
}

export type InitialView =
  | { kind: 'bounds'; points: LatLng[] }
  | { kind: 'center'; center: LatLng; zoom: number };

/**
 * First view of a project map: its cameras, else the project location, else
 * Thailand. Never waits for GPS.
 */
export function initialView(
  cameras: { location: LatLng }[],
  project?: LatLng,
): InitialView {
  if (cameras.length > 1) {
    return { kind: 'bounds', points: cameras.map((c) => c.location) };
  }
  if (cameras.length === 1) {
    return { kind: 'center', center: cameras[0].location, zoom: POINT_ZOOM };
  }
  if (project) return { kind: 'center', center: project, zoom: PROJECT_ZOOM };
  return { kind: 'center', ...THAILAND_VIEW };
}

/** Google Maps directions link (Maps URLs: no API key, no API call). */
export function directionsUrl(to: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}`;
}
