import {
  CAMERA_STATUSES,
  type CameraStatus,
  type ProjectCameraSummary,
} from '@cctv/shared';
import { CAMERA_STATUS_LABELS, CAMERA_STATUS_TONES } from '@/lib/labels';
import type { BadgeTone } from './ui';

const cx = (...c: (string | false | undefined)[]) =>
  c.filter(Boolean).join(' ');

/** Solid colour per badge tone, for bars and legend dots. */
const toneFill: Record<BadgeTone, string> = {
  neutral: 'bg-zinc-400',
  muted: 'bg-zinc-300',
  blue: 'bg-blue-500',
  brand: 'bg-nt-yellow',
  cyan: 'bg-teal-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
};

export const statusFill = (s: CameraStatus) => toneFill[CAMERA_STATUS_TONES[s]];

/** Statuses in workflow order with their count (zeros left out). */
export function cameraParts(summary: ProjectCameraSummary) {
  return CAMERA_STATUSES.flatMap((s) => {
    const n = summary.byStatus[s] ?? 0;
    return n > 0 ? [{ status: s, count: n }] : [];
  });
}

/** Text form of a summary, e.g. "เสนอ 2, ติดตั้งแล้ว 1". */
export function describeCameras(summary: ProjectCameraSummary): string {
  return cameraParts(summary)
    .map((p) => `${CAMERA_STATUS_LABELS[p.status]} ${p.count}`)
    .join(', ');
}

/**
 * Stacked bar of camera points by status. The bar is one image for screen
 * readers; its label lists every status with its count.
 */
export function CameraMix({
  summary,
  legend,
  className,
}: {
  summary: ProjectCameraSummary;
  legend?: boolean;
  className?: string;
}) {
  const parts = cameraParts(summary);
  if (summary.total === 0) return null;
  return (
    <div className={className}>
      <div
        role="img"
        aria-label={`สถานะจุดกล้อง: ${describeCameras(summary)}`}
        className="flex h-2 gap-0.5 overflow-hidden rounded-full"
      >
        {parts.map((p) => (
          <span
            key={p.status}
            className={cx('h-full', statusFill(p.status))}
            style={{ flexGrow: p.count, flexBasis: 0 }}
          />
        ))}
      </div>
      {legend && (
        <ul className="mt-3 space-y-1.5" aria-hidden>
          {parts.map((p) => (
            <li
              key={p.status}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="flex items-center gap-2 text-zinc-600">
                <span
                  className={cx('size-2 rounded-full', statusFill(p.status))}
                />
                {CAMERA_STATUS_LABELS[p.status]}
              </span>
              <span className="font-medium tabular-nums">
                {p.count.toLocaleString('th-TH')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
