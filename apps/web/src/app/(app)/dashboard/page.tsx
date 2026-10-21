'use client';

import type { CameraListItem, DashboardSummary } from '@cctv/shared';
import Link from 'next/link';
import { CameraMix } from '@/components/camera-mix';
import { DayChart } from '@/components/day-chart';
import { PageHero } from '@/components/page-hero';
import {
  IconCamera,
  IconCheck,
  IconClock,
  IconFolder,
  IconImage,
  IconMap,
  IconReport,
} from '@/components/icons';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LinkButton,
  Skeleton,
  StatCard,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import {
  CAMERA_STATUS_LABELS,
  CAMERA_STATUS_TONES,
  formatRelative,
} from '@/lib/labels';
import { useAllCameras, useDashboard } from '@/lib/queries';
import { FOLLOW_UP_LABELS, followUp, type FollowUp } from '@/lib/report';
import { useCan } from '@/lib/session';

/** Project statuses that count as work in progress. */
const ACTIVE_PROJECTS = [
  'surveying',
  'designed',
  'quoted',
  'installing',
] as const;

/** Points loaded for "ต้องตามต่อ" and "อัปเดตล่าสุด" (newest change first). */
const RECENT_LIMIT = 500;
const FOLLOW_UP_SHOWN = 8;

const FOLLOW_UP_TONES = {
  pending: 'amber',
  issue: 'red',
  incomplete: 'orange',
} as const;

export default function DashboardPage() {
  const summary = useDashboard();
  const recent = useAllCameras({}, RECENT_LIMIT);
  const s = summary.data;

  return (
    <>
      <PageHero
        title="แดชบอร์ด"
        subtitle={
          s
            ? `ภาพรวมทุกโครงการ · ข้อมูล ${formatRelative(s.generatedAt)}`
            : 'ภาพรวมทุกโครงการ'
        }
        actions={
          <>
            <LinkButton href="/map" variant="glass">
              <IconMap className="size-4" /> แผนที่สำรวจ
            </LinkButton>
            <LinkButton href="/reports" variant="glass">
              <IconReport className="size-4" /> รายงาน
            </LinkButton>
          </>
        }
      />
      {summary.isError ? (
        <ErrorState
          message={errorMessage(summary.error)}
          onRetry={() => summary.refetch()}
        />
      ) : (
        <div className="space-y-6">
          <Stats s={s} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <h2 className="text-base font-semibold">
                จุดที่สำรวจต่อวัน (30 วัน)
              </h2>
              <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                นับตามวันที่สำรวจของแต่ละจุด เวลาประเทศไทย
              </p>
              {s ? (
                <DayChart
                  days={s.surveyedByDay}
                  unit="จุด"
                  label="จุดที่สำรวจต่อวัน 30 วันล่าสุด"
                />
              ) : (
                <Skeleton lines={2} />
              )}
            </Card>
            <Card>
              <h2 className="mb-4 text-base font-semibold">สถานะจุดกล้อง</h2>
              {!s ? (
                <Skeleton lines={2} />
              ) : s.cameras.points === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  ยังไม่มีจุดกล้อง
                </p>
              ) : (
                <CameraMix
                  summary={{
                    total: s.cameras.points,
                    byStatus: s.cameras.byStatus,
                  }}
                  legend
                />
              )}
            </Card>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <FollowUps
              cameras={recent.data?.cameras}
              error={recent.isError ? errorMessage(recent.error) : undefined}
              truncated={recent.data?.truncated}
            />
            <Surveyors s={s} />
          </div>
          <Recent cameras={recent.data?.cameras} />
        </div>
      )}
    </>
  );
}

function Stats({ s }: { s?: DashboardSummary }) {
  const active = s
    ? ACTIVE_PROJECTS.reduce((n, k) => n + (s.projects.byStatus[k] ?? 0), 0)
    : undefined;
  const week = s
    ? s.surveyedByDay.slice(-7).reduce((n, d) => n + d.points, 0)
    : undefined;
  const cards = [
    {
      label: 'โครงการที่กำลังดำเนินการ',
      value: active,
      hint: s && `จากทั้งหมด ${s.projects.total} โครงการ`,
      icon: <IconFolder />,
      tone: 'violet' as const,
    },
    {
      label: 'จุดกล้อง',
      value: s?.cameras.points,
      hint: s && `กล้องรวม ${s.cameras.units} ตัว`,
      icon: <IconCamera />,
      tone: 'blue' as const,
    },
    {
      label: 'สำรวจใน 7 วัน',
      value: week,
      hint: 'จุด',
      icon: <IconClock />,
      tone: 'cyan' as const,
    },
    {
      label: 'ติดตั้งแล้ว',
      value: s?.cameras.byStatus.installed ?? (s ? 0 : undefined),
      hint: 'จุด',
      icon: <IconCheck />,
      tone: 'green' as const,
    },
    {
      label: 'รูปหน้างาน',
      value: s?.cameras.photos,
      hint: 'รูป',
      icon: <IconImage />,
      tone: 'amber' as const,
      wide: true,
    },
  ];
  return (
    <section aria-label="สรุปภาพรวม" className="relative -mt-8 px-1 sm:px-3">
      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((c, i) => (
          <StatCard
            key={c.label}
            label={c.label}
            value={c.value?.toLocaleString('th-TH')}
            hint={c.hint}
            icon={c.icon}
            tone={c.tone}
            wide={'wide' in c}
            // The row on the band gets a soft indigo shadow: 2 cards on
            // phones, 4 from lg.
            raised={i < 2 ? true : i < 4 ? 'lg' : undefined}
            className={'wide' in c ? 'col-span-2 lg:col-span-4' : undefined}
          />
        ))}
      </dl>
    </section>
  );
}

function FollowUps({
  cameras,
  error,
  truncated,
}: {
  cameras?: CameraListItem[];
  error?: string;
  truncated?: boolean;
}) {
  const canWrite = useCan('camera:write');
  const open = (cameras ?? []).flatMap((c) => {
    const why = followUp(c);
    return why ? [{ c, why }] : [];
  });
  // Pending and flagged points first, then the incomplete ones.
  const order: Record<FollowUp, number> = {
    issue: 0,
    pending: 1,
    incomplete: 2,
  };
  open.sort((a, b) => order[a.why] - order[b.why]);

  return (
    <Card className="lg:col-span-2">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">ต้องตามต่อ</h2>
        {cameras && (
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {open.length} จุด
            {truncated && ` (จาก ${cameras.length} จุดที่แก้ไขล่าสุด)`}
          </span>
        )}
      </div>
      {error ? (
        <ErrorState message={error} />
      ) : !cameras ? (
        <Skeleton lines={2} />
      ) : open.length === 0 ? (
        <EmptyState
          title="ไม่มีจุดที่ต้องตามต่อ"
          detail="ทุกจุดสำรวจแล้ว ข้อมูลหลักครบ และไม่มีจุดที่มีปัญหา"
        />
      ) : (
        <ul
          aria-label="จุดที่ต้องตามต่อ"
          className="-my-2 divide-y divide-zinc-100 dark:divide-zinc-800"
        >
          {open.slice(0, FOLLOW_UP_SHOWN).map(({ c, why }) => (
            <li key={c.id}>
              <Link
                href={canWrite ? `/cameras/${c.id}/survey` : `/cameras/${c.id}`}
                className="flex min-h-14 items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:bg-zinc-800"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.label}</span>
                  <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {c.projectName}
                  </span>
                </span>
                <Badge tone={FOLLOW_UP_TONES[why]} dot>
                  {FOLLOW_UP_LABELS[why]}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {open.length > FOLLOW_UP_SHOWN && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 text-sm text-zinc-600 dark:text-zinc-400">
          <span>และอีก {open.length - FOLLOW_UP_SHOWN} จุด</span>
          {/* A full 44px tap target, not a link inside the sentence. */}
          <Link
            href="/reports"
            className="inline-flex min-h-11 items-center font-medium text-indigo-700 hover:underline dark:text-indigo-400"
          >
            ดูทั้งหมดในรายงานของแต่ละโครงการ →
          </Link>
        </div>
      )}
    </Card>
  );
}

function Surveyors({ s }: { s?: DashboardSummary }) {
  return (
    <Card>
      <h2 className="text-base font-semibold">ผู้สำรวจ (30 วัน)</h2>
      <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        จำนวนจุดที่บันทึก
      </p>
      {!s ? (
        <Skeleton lines={2} />
      ) : s.surveyors.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          ยังไม่มีการสำรวจใน 30 วันที่ผ่านมา
        </p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">จำนวนจุดที่สำรวจต่อผู้สำรวจ</caption>
          <thead className="sr-only">
            <tr>
              <th>ผู้สำรวจ</th>
              <th>จุด</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {s.surveyors.map((u) => (
              <tr key={u.userId}>
                <td className="truncate py-2 pr-3">{u.name}</td>
                <td className="py-2 text-right font-medium tabular-nums">
                  {u.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function Recent({ cameras }: { cameras?: CameraListItem[] }) {
  if (!cameras) return null;
  const latest = cameras.slice(0, 10);
  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold">อัปเดตล่าสุด</h2>
      {latest.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          ยังไม่มีจุดกล้อง
        </p>
      ) : (
        <ul
          aria-label="จุดกล้องที่แก้ไขล่าสุด"
          className="-my-2 divide-y divide-zinc-100 dark:divide-zinc-800"
        >
          {latest.map((c) => (
            <li key={c.id}>
              <Link
                href={`/cameras/${c.id}`}
                className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl px-2 py-2 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:bg-zinc-800"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {c.label}
                    <span className="font-normal text-zinc-500 dark:text-zinc-400">
                      {' · '}
                      {c.projectName}
                    </span>
                  </span>
                  <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {formatRelative(c.updatedAt)}
                    {c.surveyorName && ` · สำรวจโดย ${c.surveyorName}`}
                  </span>
                </span>
                <Badge tone={CAMERA_STATUS_TONES[c.status]} dot>
                  {CAMERA_STATUS_LABELS[c.status]}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
