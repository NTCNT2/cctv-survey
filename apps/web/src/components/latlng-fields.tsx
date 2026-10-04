'use client';

import { useState, useSyncExternalStore } from 'react';
import { Button, TextField } from './ui';

export interface LatLngText {
  lat: string;
  lng: string;
}

/**
 * Latitude / longitude inputs (WGS84). "Use my location" needs a secure
 * context — HTTPS, or http://localhost / 127.0.0.1 (e.g. through the SSH
 * tunnel) — so it is hidden elsewhere with a short explanation.
 */
export function LatLngFields({
  id,
  value,
  onChange,
  error,
  required,
  onLocated,
}: {
  id: string;
  value: LatLngText;
  onChange: (v: LatLngText) => void;
  error?: string;
  required?: boolean;
  /** Called with the GPS accuracy (metres) after "use my location". */
  onLocated?: (accuracyM: number) => void;
}) {
  // Only known in the browser; `false` during server rendering avoids a
  // markup mismatch.
  const geoAvailable = useSyncExternalStore(
    noSubscribe,
    () => window.isSecureContext && 'geolocation' in navigator,
    () => false,
  );
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string>();

  const locate = () => {
    setLocating(true);
    setGeoError(undefined);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({
          lat: pos.coords.latitude.toFixed(7),
          lng: pos.coords.longitude.toFixed(7),
        });
        onLocated?.(pos.coords.accuracy);
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง'
            : 'หาตำแหน่งไม่สำเร็จ',
        );
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  return (
    <fieldset>
      <legend className="text-sm font-medium">
        พิกัด (WGS84){required && <span className="text-red-600"> *</span>}
      </legend>
      <div className="mt-1 grid gap-3 sm:grid-cols-2">
        <TextField
          id={`${id}-lat`}
          label="ละติจูด (lat)"
          inputMode="decimal"
          autoComplete="off"
          placeholder="13.7563"
          value={value.lat}
          onChange={(e) => onChange({ ...value, lat: e.target.value })}
          aria-invalid={error ? true : undefined}
        />
        <TextField
          id={`${id}-lng`}
          label="ลองจิจูด (lng)"
          inputMode="decimal"
          autoComplete="off"
          placeholder="100.5018"
          value={value.lng}
          onChange={(e) => onChange({ ...value, lng: e.target.value })}
          aria-invalid={error ? true : undefined}
        />
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {geoAvailable ? (
          <Button
            type="button"
            variant="secondary"
            onClick={locate}
            busy={locating}
          >
            ใช้ตำแหน่งปัจจุบัน
          </Button>
        ) : (
          <p className="text-xs text-zinc-500">
            ปุ่ม “ใช้ตำแหน่งปัจจุบัน” ใช้ได้เมื่อเปิดผ่าน HTTPS หรือ 127.0.0.1
            เท่านั้น
          </p>
        )}
        {geoError && <p className="text-sm text-red-600">{geoError}</p>}
      </div>
    </fieldset>
  );
}

const noSubscribe = () => () => {};

export const toLatLngText = (v?: { lat: number; lng: number }): LatLngText =>
  v ? { lat: String(v.lat), lng: String(v.lng) } : { lat: '', lng: '' };
