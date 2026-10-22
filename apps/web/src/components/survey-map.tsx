'use client';

import type { CameraPoint } from '@cctv/shared';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { CAMERA_STATUS_COLORS, CAMERA_STATUS_LABELS } from '@/lib/labels';
import { initialView, POINT_ZOOM } from '@/lib/map-geo';
import type { SurveyMapHandle, SurveyMapProps } from './survey-map-types';

/** OpenStreetMap raster tiles (no key); NEXT_PUBLIC_MAP_TILE_URL overrides. */
const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ??
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
/** Markers closer than this on screen are hard to tap apart. */
const OVERLAP_PX = 28;

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

/** Label + coloured pin; the label is user input, so it is escaped. */
function markerHtml(c: CameraPoint) {
  return `<span class="cctv-pin" style="--pin:${CAMERA_STATUS_COLORS[c.status]}">
    <span class="cctv-pin-dot"></span>
    <span class="cctv-pin-label">${escapeHtml(c.label)}</span>
  </span>`;
}

/**
 * Leaflet map of a project's camera points and the device position. Leaflet
 * touches `window`, so it is loaded in the browser only (dynamic import).
 */
export const SurveyMap = forwardRef<SurveyMapHandle, SurveyMapProps>(
  function SurveyMap(
    { cameras, fix, home, picking, picked, onPick, onSelect },
    ref,
  ) {
    const el = useRef<HTMLDivElement>(null);
    const map = useRef<Leaflet.Map | null>(null);
    const L = useRef<typeof Leaflet | null>(null);
    const markers = useRef<Leaflet.LayerGroup | null>(null);
    const me = useRef<{
      dot: Leaflet.CircleMarker;
      ring: Leaflet.Circle;
    } | null>(null);
    const fitted = useRef(false);
    const pin = useRef<Leaflet.Marker | null>(null);
    const [ready, setReady] = useState(false);
    // Latest callbacks without re-binding Leaflet handlers.
    const select = useRef(onSelect);
    const pick = useRef(onPick);
    const pickingNow = useRef(picking);
    useEffect(() => {
      select.current = onSelect;
      pick.current = onPick;
      pickingNow.current = picking;
    });

    useImperativeHandle(ref, () => ({
      flyTo: (to, zoom = POINT_ZOOM) =>
        map.current?.flyTo([to.lat, to.lng], zoom, { duration: 0.6 }),
    }));

    // Create the map once.
    useEffect(() => {
      let cancelled = false;
      void import('leaflet').then((mod) => {
        if (cancelled || !el.current || map.current) return;
        const lib = mod.default;
        L.current = lib;
        const phone = window.matchMedia('(max-width: 767px)').matches;
        const first = initialView([], home);
        const m = lib.map(el.current, {
          center:
            first.kind === 'center'
              ? [first.center.lat, first.center.lng]
              : [first.points[0].lat, first.points[0].lng],
          zoom: first.kind === 'center' ? first.zoom : POINT_ZOOM,
          // Phones pinch to zoom; the +/- buttons would sit under the thumbs.
          zoomControl: !phone,
          attributionControl: false,
        });
        lib.control
          .attribution({ position: 'bottomleft', prefix: false })
          .addAttribution(ATTRIBUTION)
          .addTo(m);
        if (!phone) m.zoomControl.setPosition('bottomleft');
        lib.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(m);
        markers.current = lib.layerGroup().addTo(m);
        // Pick mode only: a tap reports the position (no camera is created).
        m.on('click', (e: Leaflet.LeafletMouseEvent) => {
          if (pickingNow.current) {
            pick.current({ lat: e.latlng.lat, lng: e.latlng.lng });
          }
        });
        map.current = m;
        setReady(true);
      });
      return () => {
        cancelled = true;
        map.current?.remove();
        map.current = null;
        markers.current = null;
        me.current = null;
        pin.current = null;
      };
      // `home` only matters for the first view.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Camera markers: redrawn when the list changes (not when the map moves).
    useEffect(() => {
      const lib = L.current;
      const m = map.current;
      if (!ready || !lib || !m || !markers.current) return;
      markers.current.clearLayers();
      for (const c of cameras) {
        lib
          .marker([c.location.lat, c.location.lng], {
            icon: lib.divIcon({
              className: 'cctv-pin-wrap',
              html: markerHtml(c),
              iconSize: [0, 0],
            }),
            keyboard: true,
            title: `${c.label} — ${CAMERA_STATUS_LABELS[c.status]}`,
            riseOnHover: true,
          })
          .on('click', () => {
            const at = m.latLngToContainerPoint([
              c.location.lat,
              c.location.lng,
            ]);
            const near = cameras
              .map((o) => ({
                id: o.id,
                d: at.distanceTo(
                  m.latLngToContainerPoint([o.location.lat, o.location.lng]),
                ),
              }))
              .filter((o) => o.d < OVERLAP_PX)
              .sort((a, b) => a.d - b.d)
              .map((o) => o.id);
            select.current(near.length > 0 ? near : [c.id]);
          })
          .addTo(markers.current);
      }
      if (!fitted.current && cameras.length > 0) {
        fitted.current = true;
        const bounds = lib.latLngBounds(
          cameras.map((c) => [c.location.lat, c.location.lng]),
        );
        m.fitBounds(bounds, { padding: [48, 48], maxZoom: POINT_ZOOM });
      }
    }, [cameras, ready]);

    // Device position: dot + accuracy circle.
    useEffect(() => {
      const lib = L.current;
      const m = map.current;
      if (!ready || !lib || !m || !fix) return;
      const at: [number, number] = [fix.lat, fix.lng];
      if (!me.current) {
        me.current = {
          ring: lib
            .circle(at, {
              radius: fix.accuracy,
              color: '#2563eb',
              weight: 1,
              fillOpacity: 0.12,
              interactive: false,
            })
            .addTo(m),
          dot: lib
            .circleMarker(at, {
              radius: 8,
              color: '#ffffff',
              weight: 3,
              fillColor: '#2563eb',
              fillOpacity: 1,
              interactive: false,
            })
            .addTo(m),
        };
        // No camera to frame yet: start where the surveyor is.
        if (!fitted.current && cameras.length === 0) {
          fitted.current = true;
          m.setView(at, POINT_ZOOM);
        }
      } else {
        me.current.ring.setLatLng(at).setRadius(fix.accuracy);
        me.current.dot.setLatLng(at);
      }
    }, [fix, ready, cameras.length]);

    // Temporary marker of the picked position.
    useEffect(() => {
      const lib = L.current;
      const m = map.current;
      if (!ready || !lib || !m) return;
      m.getContainer().style.cursor = picking ? 'crosshair' : '';
      if (!picked) {
        pin.current?.remove();
        pin.current = null;
        return;
      }
      const at: [number, number] = [picked.lat, picked.lng];
      if (pin.current) pin.current.setLatLng(at);
      else {
        pin.current = lib
          .marker(at, {
            icon: lib.divIcon({
              className: 'cctv-pin-wrap',
              html: '<span class="cctv-pick-pin" data-testid="picked-marker"></span>',
              iconSize: [0, 0],
            }),
            interactive: false,
            keyboard: false,
          })
          .addTo(m);
      }
    }, [picked, picking, ready]);

    return (
      <div
        ref={el}
        role="region"
        aria-label="แผนที่สำรวจ"
        data-map-engine="leaflet"
        className="absolute inset-0 z-0 bg-zinc-100"
      />
    );
  },
);
