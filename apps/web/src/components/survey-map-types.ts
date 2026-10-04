import type { CameraPoint } from '@cctv/shared';
import type { GpsFix } from '@/lib/geolocation';
import type { LatLng } from '@/lib/map-geo';

/** What the survey page needs from a map engine (Google or Leaflet). */
export interface SurveyMapProps {
  cameras: CameraPoint[];
  /** Device position, shown only after the user asked for it. */
  fix?: GpsFix;
  /** Project location: first view when there is no camera yet. */
  home?: LatLng;
  /** Pick mode: a tap on the map reports a position (normal mode: nothing). */
  picking: boolean;
  /** Temporary marker of the picked position. */
  picked?: LatLng;
  onPick: (at: LatLng) => void;
  /** Tapped marker; with overlapping markers all of them, nearest first. */
  onSelect: (ids: string[]) => void;
}

export interface SurveyMapHandle {
  flyTo: (to: LatLng, zoom?: number) => void;
}
