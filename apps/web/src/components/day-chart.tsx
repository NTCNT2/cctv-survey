'use client';

import { useId, useState } from 'react';

const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  // Noon UTC: the same calendar day in every time zone.
  new Intl.DateTimeFormat('th-TH', { ...opts, timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`),
  );

/** A clean axis top: 1, 2, 5 × 10^n at or above `max` (at least 1). */
export function niceMax(max: number): number {
  if (max <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

/**
 * Column chart of one series per calendar day (survey points). Columns grow
 * from one baseline, 2px apart, rounded only at the top; each column is its
 * own hover / focus target with a tooltip. A table view carries every value.
 */
export function DayChart({
  days,
  unit,
  label,
}: {
  days: { date: string; points: number }[];
  /** e.g. "จุด" */
  unit: string;
  /** Accessible name of the chart. */
  label: string;
}) {
  const [active, setActive] = useState<number>();
  const tableId = useId();
  const top = niceMax(Math.max(0, ...days.map((d) => d.points)));
  const total = days.reduce((n, d) => n + d.points, 0);
  const long = (iso: string) =>
    dayLabel(iso, { day: 'numeric', month: 'short', year: 'numeric' });
  const short = (iso: string) =>
    dayLabel(iso, { day: 'numeric', month: 'short' });
  const ticks = [0, Math.floor(days.length / 2), days.length - 1];

  return (
    <figure>
      <div className="flex gap-2">
        {/* Y axis: the top and the baseline are enough at this size. */}
        <div
          aria-hidden
          className="flex h-40 flex-col justify-between text-right text-xs tabular-nums text-zinc-500"
        >
          <span className="-translate-y-1/2">{top}</span>
          <span className="translate-y-1/2">0</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 border-t border-zinc-100"
          />
          <div
            role="img"
            aria-label={`${label}: รวม ${total} ${unit} ใน ${days.length} วัน (ดูตารางด้านล่างสำหรับค่ารายวัน)`}
            className="flex h-40 items-end gap-0.5 border-b border-zinc-200"
            onMouseLeave={() => setActive(undefined)}
          >
            {days.map((d, i) => (
              <div
                key={d.date}
                data-testid="day-bar"
                data-date={d.date}
                data-points={d.points}
                className="group relative flex h-full min-w-0 flex-1 cursor-default items-end justify-center outline-none"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(undefined)}
                tabIndex={-1}
              >
                <div
                  className={
                    // Charcoal: yellow bars would be under 3:1 on the white card.
                    'w-full max-w-6 rounded-t bg-nt-charcoal transition-opacity' +
                    (active !== undefined && active !== i ? ' opacity-50' : '')
                  }
                  style={{ height: `${(d.points / top) * 100}%` }}
                />
                {active === i && (
                  <div
                    role="tooltip"
                    className={
                      'pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg bg-nt-charcoal px-2.5 py-1.5 text-xs text-white shadow-lg ' +
                      (i < 4
                        ? 'left-0'
                        : i > days.length - 5
                          ? 'right-0'
                          : 'left-1/2 -translate-x-1/2')
                    }
                  >
                    {long(d.date)} ·{' '}
                    <span className="font-semibold tabular-nums">
                      {d.points}
                    </span>{' '}
                    {unit}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div
            aria-hidden
            className="mt-1.5 flex justify-between text-xs text-zinc-500"
          >
            {ticks.map((t) => (
              <span key={t}>{days[t] && short(days[t].date)}</span>
            ))}
          </div>
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-ink underline underline-offset-2">
          ดูเป็นตาราง
        </summary>
        <table
          id={tableId}
          className="mt-2 w-full text-left text-sm tabular-nums"
        >
          <caption className="sr-only">{label}</caption>
          <thead className="text-xs text-zinc-500">
            <tr>
              <th className="py-1 font-medium">วันที่</th>
              <th className="py-1 text-right font-medium">{unit}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {[...days].reverse().map((d) => (
              <tr key={d.date}>
                <td className="py-1">{long(d.date)}</td>
                <td className="py-1 text-right">{d.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
