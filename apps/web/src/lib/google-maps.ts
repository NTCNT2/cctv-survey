/**
 * Google Maps JavaScript API loader (browser only). Loads the API once per
 * page with `loading=async`, then libraries come from `importLibrary`
 * (Google's documented dynamic library import). The key is a browser key:
 * restrict it by HTTP referrer and to the Maps JavaScript API in Google Cloud.
 */

/** Runtime map settings, read on the server (see map/page.tsx). */
export interface MapsConfig {
  googleApiKey?: string;
  /** Advanced markers need a Map ID; DEMO_MAP_ID is for development only. */
  googleMapId?: string;
  /**
   * Development only: OpenStreetMap (Leaflet) may stand in for Google Maps.
   * Off in production, where a missing or broken Google Maps setup is shown
   * as an error instead of silently switching maps.
   */
  osmFallback: boolean;
}

export const DEV_MAP_ID = 'DEMO_MAP_ID';
export const KEY_ENV = 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY';
export const MAP_ID_ENV = 'NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID';
const CALLBACK = '__cctvGoogleMapsReady';
/** No callback after this long: report the map as unavailable. */
export const LOAD_TIMEOUT_MS = 20_000;

export type MapSetup =
  | { engine: 'google'; apiKey: string; mapId: string }
  | { engine: 'osm' }
  | { engine: 'unconfigured'; missing: string[] };

/** Which map the survey page shows: Google Maps unless it is not set up. */
export function mapSetup(c: MapsConfig): MapSetup {
  if (c.googleApiKey && c.googleMapId) {
    return { engine: 'google', apiKey: c.googleApiKey, mapId: c.googleMapId };
  }
  if (c.osmFallback) return { engine: 'osm' };
  return {
    engine: 'unconfigured',
    missing: [
      ...(c.googleApiKey ? [] : [KEY_ENV]),
      ...(c.googleMapId ? [] : [MAP_ID_ENV]),
    ],
  };
}

export function scriptUrl(key: string): string {
  const q = new URLSearchParams({
    key,
    v: 'weekly',
    loading: 'async',
    callback: CALLBACK,
  });
  return `https://maps.googleapis.com/maps/api/js?${q}`;
}

type Win = Window & {
  google?: typeof google;
  gm_authFailure?: () => void;
  [CALLBACK]?: () => void;
};

let loading: Promise<void> | undefined;
let authFailed = false;
const authListeners = new Set<() => void>();

/**
 * Called when Google rejects the key (wrong referrer, billing, API off).
 * Google reports it once per page, so a map mounted later hears it at once.
 */
export function onAuthFailure(fn: () => void): () => void {
  authListeners.add(fn);
  if (authFailed) queueMicrotask(fn);
  return () => authListeners.delete(fn);
}

/** Resolves once `google.maps.importLibrary` is available. */
export function loadGoogleMaps(key: string): Promise<void> {
  const w = window as Win;
  if (w.google?.maps?.importLibrary) return Promise.resolve();
  if (loading) return loading;
  w.gm_authFailure = () => {
    authFailed = true;
    authListeners.forEach((fn) => fn());
  };
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    const fail = (why: string) => {
      clearTimeout(timer);
      loading = undefined;
      s.remove();
      reject(new Error(why));
    };
    const timer = setTimeout(
      () => fail('Google Maps did not load in time'),
      LOAD_TIMEOUT_MS,
    );
    w[CALLBACK] = () => {
      clearTimeout(timer);
      resolve();
    };
    s.src = scriptUrl(key);
    s.async = true;
    s.onerror = () => fail('Google Maps could not load');
    document.head.append(s);
  });
  return loading;
}
