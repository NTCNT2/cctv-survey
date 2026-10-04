'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Accuracy (metres) above which a fix is "weak": wait before saving a point. */
export const WEAK_ACCURACY_M = 20;
/** A fix younger than this is reused instead of asking the device again. */
export const FRESH_MS = 30_000;

export type GpsStatus =
  | 'idle'
  | 'locating'
  | 'ready'
  | 'weak'
  | 'unavailable'
  | 'denied'
  | 'insecure';

export interface GpsFix {
  lat: number;
  lng: number;
  /** Radius in metres (68 % confidence, as reported by the device). */
  accuracy: number;
  /** Epoch milliseconds of the fix. */
  timestamp: number;
}

export interface GpsState {
  status: GpsStatus;
  fix?: GpsFix;
}

/** Ready or weak, from the accuracy of a fix. */
export const statusForFix = (fix: GpsFix): GpsStatus =>
  fix.accuracy > WEAK_ACCURACY_M ? 'weak' : 'ready';

export const isFresh = (fix: GpsFix | undefined, now = Date.now()) =>
  !!fix && now - fix.timestamp < FRESH_MS;

/** Status after a geolocation error (GeolocationPositionError codes). */
export const statusForError = (code: number): GpsStatus =>
  code === 1 ? 'denied' : 'unavailable';

export const GPS_LABELS: Record<GpsStatus, string> = {
  idle: 'ยังไม่ได้ขอตำแหน่ง',
  locating: 'กำลังหาตำแหน่ง…',
  ready: 'GPS พร้อม',
  weak: 'GPS อ่อน',
  unavailable: 'หาตำแหน่งไม่ได้',
  denied: 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง',
  insecure: 'GPS ใช้ได้เฉพาะ HTTPS',
};

/**
 * One position watcher for the lifetime of the component (removed on
 * unmount). Browsers only allow geolocation in a secure context (HTTPS or
 * localhost): elsewhere the status is "insecure" and no request is made.
 */
export function useGeolocation(enabled = true) {
  const [state, setState] = useState<GpsState>({ status: 'idle' });
  const watchId = useRef<number | null>(null);
  const latest = useRef<GpsFix | undefined>(undefined);

  const start = useCallback(() => {
    if (watchId.current !== null) return;
    if (!window.isSecureContext || !('geolocation' in navigator)) {
      setState({ status: 'insecure' });
      return;
    }
    setState((s) => ({ ...s, status: s.fix ? s.status : 'locating' }));
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const fix: GpsFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp || Date.now(),
        };
        latest.current = fix;
        setState({ status: statusForFix(fix), fix });
      },
      (err) => {
        setState((s) => ({ status: statusForError(err.code), fix: s.fix }));
        if (err.code === 1 && watchId.current !== null) {
          navigator.geolocation.clearWatch(watchId.current);
          watchId.current = null;
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
  }, []);

  useEffect(() => {
    // Subscribing to the browser's geolocation API: an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (enabled) start();
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [enabled, start]);

  /** The latest fix if it is fresh; otherwise (re)starts the watcher. */
  const current = useCallback((): GpsFix | undefined => {
    if (isFresh(latest.current)) return latest.current;
    start();
    return latest.current;
  }, [start]);

  return { ...state, start, current };
}
