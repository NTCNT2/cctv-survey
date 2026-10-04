import type { Page } from '@playwright/test';

/**
 * A small stand-in for the Google Maps JavaScript API (maps, marker, core
 * libraries), served instead of maps.googleapis.com so tests never call
 * Google. It renders markers as DOM elements in the map container and exposes
 * `window.__gmap` to inspect the map and simulate taps.
 */
const STUB = String.raw`
(() => {
  const script = document.currentScript;
  const params = new URL(script.src).searchParams;
  const maps = (window.google = window.google || {}).maps = {};
  const state = (window.__gmap = { maps: [], requests: [], loads: 0 });
  state.loads += 1;
  state.requests.push(script.src);

  class LatLng {
    constructor(lat, lng) { this._lat = lat; this._lng = lng; }
    lat() { return this._lat; }
    lng() { return this._lng; }
  }
  const plain = (p) => (p instanceof LatLng ? { lat: p.lat(), lng: p.lng() } : p);

  class LatLngBounds {
    constructor() { this.points = []; }
    extend(p) { this.points.push(plain(p)); return this; }
  }

  class Map {
    constructor(el, opts) {
      this.el = el;
      this.opts = { ...opts };
      this.center = opts.center;
      this.zoom = opts.zoom;
      this.listeners = {};
      this.layer = document.createElement('div');
      this.layer.dataset.testid = 'gmap';
      this.layer.style.cssText = 'position:absolute;inset:0';
      el.append(this.layer);
      state.maps.push(this);
      state.map = this;
    }
    addListener(ev, fn) {
      (this.listeners[ev] = this.listeners[ev] || []).push(fn);
      return { remove: () => {} };
    }
    setOptions(o) { Object.assign(this.opts, o); }
    panTo(p) { this.center = plain(p); }
    setCenter(p) { this.center = plain(p); }
    getCenter() { return new LatLng(this.center.lat, this.center.lng); }
    setZoom(z) { this.zoom = z; }
    getZoom() { return this.zoom; }
    fitBounds(b) {
      const ps = b.points;
      const lat = ps.reduce((s, p) => s + p.lat, 0) / ps.length;
      const lng = ps.reduce((s, p) => s + p.lng, 0) / ps.length;
      this.center = { lat, lng };
      this.zoom = 14;
      this.fitted = ps.length;
    }
    /** Test hook: a tap on the map at lat/lng. */
    click(lat, lng) {
      for (const fn of this.listeners.click || []) fn({ latLng: new LatLng(lat, lng) });
    }
  }

  class Circle {
    constructor(o) { this.o = { ...o }; state.circle = this; }
    setCenter(c) { this.o.center = plain(c); }
    setRadius(r) { this.o.radius = r; }
    setMap(m) { this.o.map = m; }
  }

  class AdvancedMarkerElement {
    constructor(o) {
      this.el = document.createElement('div');
      this.el.className = 'gm-stub-marker';
      // Not projected: markers are laid out in a row in the middle of the map,
      // clear of the overlays at the top and bottom.
      const n = (state.markerCount = (state.markerCount || 0) + 1);
      this.el.style.cssText =
        'position:absolute;top:45%;left:' + (10 + ((n - 1) % 5) * 18) + '%';
      if (o.title) this.el.title = o.title;
      if (o.gmpClickable) {
        this.el.setAttribute('role', 'button');
        this.el.tabIndex = 0;
      }
      if (o.content) this.el.append(o.content);
      this._position = o.position;
      this.map = o.map || null;
    }
    set map(m) {
      this._map = m;
      if (m) m.layer.append(this.el); else this.el.remove();
    }
    get map() { return this._map; }
    set position(p) { this._position = plain(p); }
    get position() { return this._position; }
    addEventListener(ev, fn) {
      if (ev === 'gmp-click') this.el.addEventListener('click', () => fn({}));
    }
  }

  const libs = {
    core: { LatLng, LatLngBounds },
    maps: { Map, Circle },
    marker: { AdvancedMarkerElement },
  };
  maps.importLibrary = (name) => Promise.resolve(libs[name]);
  const cb = params.get('callback');
  setTimeout(() => {
    window[cb]();
    if (window.__gmapAuthFail) window.gm_authFailure && window.gm_authFailure();
  }, 0);
})();
`;

/** Serve the stub for every Maps JavaScript API request of this page. */
export async function stubGoogleMaps(
  page: Page,
  opts: { authFail?: boolean } = {},
) {
  if (opts.authFail) {
    await page.addInitScript(() => {
      (window as unknown as { __gmapAuthFail: boolean }).__gmapAuthFail = true;
    });
  }
  await page.route(/maps\.googleapis\.com\/maps\/api\/js/, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: STUB }),
  );
  // Anything else from Google (tiles, fonts) is not needed by the stub.
  await page.route(
    /(maps\.gstatic\.com|maps\.googleapis\.com\/(?!maps\/api\/js))/,
    (r) => r.abort(),
  );
}

/** A CCTV marker on the Google map, by its point code. */
export const googleMarker = (page: Page, label: string) =>
  page.locator('.gm-stub-marker', {
    has: page.locator('.cctv-pin-label', { hasText: new RegExp(`^${label}$`) }),
  });

/** Simulates a tap on the Google map at a position. */
export const tapGoogleMap = (page: Page, lat: number, lng: number) =>
  page.evaluate(
    ([a, b]) =>
      (
        window as unknown as {
          __gmap: { map: { click: (x: number, y: number) => void } };
        }
      ).__gmap.map.click(a, b),
    [lat, lng] as const,
  );
