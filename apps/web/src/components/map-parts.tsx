import type { CameraPoint } from '@cctv/shared';
import type { ReactNode } from 'react';
import { CAMERA_STATUS_LABELS, CAMERA_STATUS_TONES } from '@/lib/labels';
import { Badge } from './ui';

const fmt = (n: number, digits = 6) => n.toFixed(digits);

/** Covers the map area when no map engine can be used. */
export function MapUnavailable({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-[1] grid place-items-center bg-zinc-100 p-6">
      <div
        role="alert"
        data-testid="map-unavailable"
        className="max-w-sm space-y-3 rounded-3xl bg-white p-5 text-center shadow-xl ring-1 ring-zinc-900/5"
      >
        <p className="font-semibold">{title}</p>
        <p className="text-sm break-words text-zinc-600">{children}</p>
        {action}
      </div>
    </div>
  );
}

/** Camera points as large tap targets (map sheets: list, overlapping markers). */
export function PointList<C extends CameraPoint>({
  label,
  points,
  onChoose,
  detail,
}: {
  label: string;
  points: C[];
  onChoose: (c: C) => void;
  /** Second line; default: the address, or the coordinates. */
  detail?: (c: C) => string;
}) {
  return (
    <ul aria-label={label} className="-mx-2">
      {points.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onChoose(c)}
            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl px-2 text-left hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-nt-charcoal"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{c.label}</span>
              <span className="block truncate text-xs text-zinc-500">
                {detail
                  ? detail(c)
                  : (c.address ??
                    `${fmt(c.location.lat)}, ${fmt(c.location.lng)}`)}
              </span>
            </span>
            <Badge tone={CAMERA_STATUS_TONES[c.status]} dot>
              {CAMERA_STATUS_LABELS[c.status]}
            </Badge>
          </button>
        </li>
      ))}
    </ul>
  );
}
