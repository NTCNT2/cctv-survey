'use client';

import { useCallback, useState } from 'react';

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

/** Why a position request failed (no crash: callers show a message). */
export class LocationError extends Error {
  constructor(readonly status: GpsStatus) {
    super(GPS_LABELS[status]);
  }
}

/**
 * One position request (no watcher). Geolocation needs a secure context
 * (HTTPS or localhost): elsewhere it fails with status "insecure".
 */
export function getPosition(maximumAge = 0): Promise<GpsFix> {
  if (typeof window === 'undefined' || !window.isSecureContext) {
    return Promise.reject(new LocationError('insecure'));
  }
  if (!('geolocation' in navigator)) {
    return Promise.reject(new LocationError('unavailable'));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp || Date.now(),
        }),
      (err) => reject(new LocationError(statusForError(err.code))),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge },
    );
  });
}

/**
 * Device position on demand. Nothing is requested until `locate` is called
 * (the map never asks for GPS by itself).
 */
export function useDeviceLocation() {
  const [state, setState] = useState<GpsState>({ status: 'idle' });

  /** Never rejects: the result carries either a fix or the failure status. */
  const locate = useCallback(
    async (maximumAge = 0): Promise<{ fix?: GpsFix; status: GpsStatus }> => {
      setState((s) => ({ ...s, status: 'locating' }));
      try {
        const fix = await getPosition(maximumAge);
        const status = statusForFix(fix);
        setState({ status, fix });
        return { fix, status };
      } catch (err) {
        const status =
          err instanceof LocationError ? err.status : 'unavailable';
        setState((s) => ({ status, fix: s.fix }));
        return { status };
      }
    },
    [],
  );

  return { ...state, locate };
}
