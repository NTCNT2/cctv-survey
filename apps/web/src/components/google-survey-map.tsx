'use client';

import type { CameraPoint } from '@cctv/shared';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { loadGoogleMaps, onAuthFailure } from '@/lib/google-maps';
import { CAMERA_STATUS_COLORS, CAMERA_STATUS_LABELS } from '@/lib/labels';
import { initialView, overlapping, POINT_ZOOM } from '@/lib/map-geo';
import type { SurveyMapHandle, SurveyMapProps } from './survey-map-types';

const SVG = 'http://www.w3.org/2000/svg';

/** CCTV camera glyph (inline SVG: no external image). */
function cameraGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'cctv-gmarker-glyph');
  for (const d of [
    'M3 8.5 15.5 5l2 6.5L5 15z',
    'm17 9 3.5-1v6L18 13.5',
    'M7.5 14.5 8 20h-3',
  ]) {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

/**
 * Marker content: status-coloured badge with the camera glyph and the point
 * code. Built with DOM APIs (textContent), so user input is never parsed as
 * HTML.
 */
function cameraMarker(c: CameraPoint): HTMLElement {
  const root = document.createElement('div');
  root.className = 'cctv-gmarker';
  root.dataset.status = c.status;
  root.style.setProperty('--pin', CAMERA_STATUS_COLORS[c.status]);
  const badge = document.createElement('span');
  badge.className = 'cctv-gmarker-badge';
  badge.append(cameraGlyph());
  const label = document.createElement('span');
  label.className = 'cctv-pin-label';
  label.textContent = c.label;
  root.append(badge, label);
  return root;
}

function dot(className: string, testId?: string): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  if (testId) el.dataset.testid = testId;
  return el;
}

/**
 * Google Maps engine of the survey map: Advanced Markers (Map ID required),
 * one map per page load, no polling, no Places / Geocoding calls.
 */
export const GoogleSurveyMap = forwardRef<
  SurveyMapHandle,
  SurveyMapProps & {
    apiKey: string;
    mapId: string;
    onError: (message: string) => void;
  }
>(function GoogleSurveyMap(
  {
    cameras,
    fix,
    home,
    picking,
    picked,
    onPick,
    onSelect,
    apiKey,
    mapId,
    onError,
  },
  ref,
) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const lib = useRef<{
    Marker: typeof google.maps.marker.AdvancedMarkerElement;
    Circle: typeof google.maps.Circle;
    Bounds: typeof google.maps.LatLngBounds;
  } | null>(null);
  const markers = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const me = useRef<{
    dot: google.maps.marker.AdvancedMarkerElement;
    ring: google.maps.Circle;
  } | null>(null);
  const pin = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);
  const latest = useRef({ onPick, onSelect, onError, picking, cameras });
  useEffect(() => {
    latest.current = { onPick, onSelect, onError, picking, cameras };
  });

  useImperativeHandle(ref, () => ({
    flyTo: (to, zoom = POINT_ZOOM) => {
      map.current?.panTo(to);
      map.current?.setZoom(zoom);
    },
  }));

  // Load the API and create the map once.
  useEffect(() => {
    let cancelled = false;
    const offAuth = onAuthFailure(() =>
      latest.current.onError(
        'Google Maps ปฏิเสธ API key — ผู้ดูแลระบบต้องตรวจ HTTP referrer, billing และการเปิด Maps JavaScript API',
      ),
    );
    loadGoogleMaps(apiKey)
      .then(async () => {
        const [{ Map, Circle }, { AdvancedMarkerElement }, { LatLngBounds }] =
          await Promise.all([
            google.maps.importLibrary(
              'maps',
            ) as Promise<google.maps.MapsLibrary>,
            google.maps.importLibrary(
              'marker',
            ) as Promise<google.maps.MarkerLibrary>,
            google.maps.importLibrary(
              'core',
            ) as Promise<google.maps.CoreLibrary>,
          ]);
        if (cancelled || !el.current || map.current) return;
        const first = initialView([], home);
        const phone = window.matchMedia('(max-width: 767px)').matches;
        const m = new Map(el.current, {
          mapId,
          center: first.kind === 'center' ? first.center : first.points[0],
          zoom: first.kind === 'center' ? first.zoom : POINT_ZOOM,
          // One finger pans on phones (no "use two fingers" overlay).
          gestureHandling: 'greedy',
          disableDefaultUI: true,
          zoomControl: !phone,
          // POI pop-ups would swallow taps meant for picking a position.
          clickableIcons: false,
        });
        m.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (latest.current.picking && e.latLng) {
            latest.current.onPick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
          }
        });
        lib.current = {
          Marker: AdvancedMarkerElement,
          Circle,
          Bounds: LatLngBounds,
        };
        map.current = m;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          latest.current.onError(
            'โหลด Google Maps ไม่สำเร็จ — ตรวจการเชื่อมต่ออินเทอร์เน็ต แล้วลองใหม่',
          );
        }
      });
    return () => {
      cancelled = true;
      offAuth();
      for (const mk of markers.current) mk.map = null;
      markers.current = [];
      if (me.current) {
        me.current.dot.map = null;
        me.current.ring.setMap(null);
      }
      me.current = null;
      if (pin.current) pin.current.map = null;
      pin.current = null;
      map.current = null;
    };
    // The map is created once; `home` only sets its first view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, mapId]);

  // Camera markers: rebuilt when the list changes, not when the map moves.
  useEffect(() => {
    const m = map.current;
    const L = lib.current;
    if (!ready || !m || !L) return;
    for (const mk of markers.current) mk.map = null;
    markers.current = cameras.map((c) => {
      const mk = new L.Marker({
        map: m,
        position: c.location,
        content: cameraMarker(c),
        title: `${c.label} — ${CAMERA_STATUS_LABELS[c.status]}`,
        gmpClickable: true,
      });
      mk.addEventListener('gmp-click', () => {
        const all = latest.current.cameras;
        latest.current.onSelect(overlapping(all, c, m.getZoom() ?? POINT_ZOOM));
      });
      return mk;
    });
    if (!fitted.current && cameras.length > 0) {
      fitted.current = true;
      const v = initialView(cameras, home);
      if (v.kind === 'bounds') {
        const b = new L.Bounds();
        for (const p of v.points) b.extend(p);
        m.fitBounds(b, 48);
      } else {
        m.setCenter(v.center);
        m.setZoom(v.zoom);
      }
    }
  }, [cameras, ready, home]);

  // Device position (only after the user asked for it).
  useEffect(() => {
    const m = map.current;
    const L = lib.current;
    if (!ready || !m || !L || !fix) return;
    const at = { lat: fix.lat, lng: fix.lng };
    if (!me.current) {
      me.current = {
        ring: new L.Circle({
          map: m,
          center: at,
          radius: fix.accuracy,
          strokeColor: '#2563eb',
          strokeWeight: 1,
          fillColor: '#2563eb',
          fillOpacity: 0.12,
          clickable: false,
        }),
        dot: new L.Marker({
          map: m,
          position: at,
          content: dot('cctv-me-dot', 'my-location'),
          title: 'ตำแหน่งของฉัน',
        }),
      };
    } else {
      me.current.ring.setCenter(at);
      me.current.ring.setRadius(fix.accuracy);
      me.current.dot.position = at;
    }
  }, [fix, ready]);

  // Temporary marker of the picked position.
  useEffect(() => {
    const m = map.current;
    const L = lib.current;
    if (!ready || !m || !L) return;
    m.setOptions({ draggableCursor: picking ? 'crosshair' : null });
    if (!picked) {
      if (pin.current) pin.current.map = null;
      pin.current = null;
      return;
    }
    if (pin.current) pin.current.position = picked;
    else {
      pin.current = new L.Marker({
        map: m,
        position: picked,
        content: dot('cctv-pick-pin', 'picked-marker'),
        title: 'ตำแหน่งที่เลือก',
      });
    }
  }, [picked, picking, ready]);

  return (
    <div
      ref={el}
      role="region"
      aria-label="แผนที่สำรวจ"
      data-map-engine="google"
      className="absolute inset-0 z-0 bg-zinc-100"
    />
  );
});
