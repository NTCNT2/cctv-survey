'use client';

import type {
  Project,
  ProjectCameraSummary,
  ProjectStatus,
} from '@cctv/shared';
import { PROJECT_STATUSES } from '@cctv/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useId,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  IconArrowRight,
  IconBuilding,
  IconCamera,
  IconCheck,
  IconClock,
  IconFolder,
  IconGrid,
  IconList,
  IconPin,
  IconSearch,
} from '@/components/icons';
import { CameraMix } from '@/components/camera-mix';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LinkButton,
  SegmentedControl,
  Skeleton,
  StatCard,
  type BadgeTone,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import {
  formatDate,
  formatRelative,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
  projectStage,
} from '@/lib/labels';
import { OVERVIEW_LIMIT, useProjectOverview, useProjects } from '@/lib/queries';
import { useCan } from '@/lib/session';

const cx = (...c: (string | false | undefined)[]) =>
  c.filter(Boolean).join(' ');

type View = 'grid' | 'list';
const VIEW_KEY = 'cctv.projects.view';

const VIEW_EVENT = 'cctv:projects-view';

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

/** Grid / list choice, remembered per browser (server render: grid). */
function useView(): [View, (v: View) => void] {
  const view = useSyncExternalStore(
    (onChange) => {
      window.addEventListener(VIEW_EVENT, onChange);
      window.addEventListener('storage', onChange);
      return () => {
        window.removeEventListener(VIEW_EVENT, onChange);
        window.removeEventListener('storage', onChange);
      };
    },
    readView,
    (): View => 'grid',
  );
  const choose = (v: View) => {
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Private mode or blocked storage: the choice just isn't remembered.
    }
    window.dispatchEvent(new Event(VIEW_EVENT));
  };
  return [view, choose];
}

export default function ProjectsPage() {
  // The toolbar keeps search / filters in the URL (?q=&status=&customer=).
  return (
    <Suspense fallback={<Skeleton lines={4} />}>
      <Projects />
    </Suspense>
  );
}

function Projects() {
  const canCreate = useCan('project:write');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? '';
  const customer = params.get('customer') ?? '';
  const filtering = Boolean(q || status || customer);

  const [view, chooseView] = useView();

  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Paged list (20 at a time) when nothing is filtered; the overview (up to
  // OVERVIEW_LIMIT) feeds the summary cards and every search / filter.
  const projects = useProjects();
  const overview = useProjectOverview();

  const createButton = canCreate ? (
    <LinkButton href="/projects/new">+ สร้างโครงการ</LinkButton>
  ) : null;

  const customers = useMemo(() => {
    const names = new Set<string>();
    for (const p of overview.data?.projects ?? []) {
      if (p.customerName) names.add(p.customerName);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'th'));
  }, [overview.data]);

  const filtered = useMemo(() => {
    if (!filtering || !overview.data) return undefined;
    const needle = q.toLocaleLowerCase('th');
    return overview.data.projects.filter(
      (p) =>
        (!status || p.status === status) &&
        (!customer || p.customerName === customer) &&
        (!needle ||
          [p.name, p.customerName, p.address].some((v) =>
            v?.toLocaleLowerCase('th').includes(needle),
          )),
    );
  }, [filtering, overview.data, q, status, customer]);

  const source = filtering ? overview : projects;
  const items: Project[] | undefined = filtering ? filtered : projects.data;

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            โครงการ
          </h1>
          <p className="mt-1.5 text-sm text-zinc-600 sm:text-base dark:text-zinc-400">
            จัดการโครงการสำรวจและออกแบบระบบ CCTV
          </p>
        </div>
        {createButton}
      </div>

      <Summary overview={overview} />

      {!filtering && overview.data && overview.data.projects.length > 0 && (
        <OfficeOverview projects={overview.data.projects} />
      )}

      <Toolbar
        q={q}
        status={status}
        customer={customer}
        customers={customers}
        view={view}
        onChange={setParam}
        onView={chooseView}
        onClear={() => router.replace(pathname, { scroll: false })}
        filtering={filtering}
      />

      {source.isPending ? (
        <Skeleton lines={4} />
      ) : source.isError ? (
        <ErrorState
          message={errorMessage(source.error)}
          onRetry={() => {
            void source.refetch();
            if (overview.isError) void overview.refetch();
          }}
        />
      ) : !items || items.length === 0 ? (
        filtering ? (
          <EmptyState
            title="ไม่พบโครงการที่ตรงกับเงื่อนไข"
            detail="ลองเปลี่ยนคำค้นหาหรือตัวกรอง"
            action={
              <Button
                variant="secondary"
                onClick={() => router.replace(pathname, { scroll: false })}
              >
                ล้างตัวกรอง
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="ยังไม่มีโครงการ"
            detail={
              canCreate
                ? 'เริ่มต้นด้วยการสร้างโครงการแรก'
                : 'เมื่อมีการสร้างโครงการ รายการจะแสดงที่นี่'
            }
            action={createButton}
          />
        )
      ) : (
        <>
          {filtering && (
            <p
              role="status"
              className="mb-3 text-sm text-zinc-600 dark:text-zinc-400"
            >
              พบ {items.length.toLocaleString('th-TH')} โครงการ
              {overview.data?.truncated &&
                ` (ค้นหาจาก ${OVERVIEW_LIMIT.toLocaleString('th-TH')} โครงการล่าสุด)`}
            </p>
          )}
          <ul
            aria-label="รายการโครงการ"
            className={
              view === 'grid'
                ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'
                : 'divide-y divide-zinc-200/80 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900'
            }
          >
            {items.map((p) => (
              <li key={p.id} className="min-w-0">
                {view === 'grid' ? (
                  <ProjectCard project={p} />
                ) : (
                  <ProjectRow project={p} />
                )}
              </li>
            ))}
          </ul>
          {!filtering && projects.hasNextPage && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="secondary"
                onClick={() => projects.fetchNextPage()}
                busy={projects.isFetchingNextPage}
              >
                แสดงเพิ่มเติม
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------

function Summary({
  overview,
}: {
  overview: ReturnType<typeof useProjectOverview>;
}) {
  const data = overview.data;
  const count = (s?: ProjectStatus) =>
    data ? data.projects.filter((p) => !s || p.status === s).length : undefined;
  const plus = data?.truncated ? '+' : '';
  const show = (n: number | undefined) =>
    n === undefined
      ? undefined
      : `${n.toLocaleString('th-TH')}${n ? plus : ''}`;
  const cards: {
    label: string;
    value: number | undefined;
    icon: ReactNode;
    tone: BadgeTone;
  }[] = [
    {
      label: 'โครงการทั้งหมด',
      value: count(),
      icon: <IconFolder />,
      tone: 'violet',
    },
    {
      label: 'กำลังสำรวจ',
      value: count('surveying'),
      icon: <IconSearch />,
      tone: 'blue',
    },
    {
      label: 'เสร็จแล้ว',
      value: count('completed'),
      icon: <IconCheck />,
      tone: 'green',
    },
    {
      label: 'แบบร่าง',
      value: count('draft'),
      icon: <IconClock />,
      tone: 'neutral',
    },
  ];
  return (
    <section aria-label="สรุปโครงการ" className="mb-8">
      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <StatCard
            key={c.label}
            label={c.label}
            value={show(c.value)}
            icon={c.icon}
            tone={c.tone}
            unavailable={overview.isError}
          />
        ))}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Toolbar: search, status / customer filters, grid / list toggle
// ---------------------------------------------------------------------------

const control =
  'min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-base shadow-sm focus:border-indigo-500 focus:outline-2 focus:outline-indigo-500/30 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900';

function Toolbar({
  q,
  status,
  customer,
  customers,
  view,
  filtering,
  onChange,
  onView,
  onClear,
}: {
  q: string;
  status: string;
  customer: string;
  customers: string[];
  view: View;
  filtering: boolean;
  onChange: (name: string, value: string) => void;
  onView: (v: View) => void;
  onClear: () => void;
}) {
  const id = useId();
  return (
    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative flex-1">
        <label htmlFor={`${id}-q`} className="sr-only">
          ค้นหาในรายการโครงการ
        </label>
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
          <IconSearch className="size-4" />
        </span>
        <input
          id={`${id}-q`}
          type="search"
          value={q}
          onChange={(e) => onChange('q', e.target.value)}
          placeholder="ค้นหาชื่อโครงการ ลูกค้า หรือที่อยู่"
          className={cx(control, 'pl-9')}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
        <div className="sm:w-44">
          <label htmlFor={`${id}-status`} className="sr-only">
            กรองตามสถานะ
          </label>
          <select
            id={`${id}-status`}
            value={status}
            onChange={(e) => onChange('status', e.target.value)}
            className={control}
          >
            <option value="">ทุกสถานะ</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:w-48">
          <label htmlFor={`${id}-customer`} className="sr-only">
            กรองตามลูกค้า
          </label>
          <select
            id={`${id}-customer`}
            value={customer}
            onChange={(e) => onChange('customer', e.target.value)}
            className={control}
          >
            <option value="">ลูกค้าทั้งหมด</option>
            {customer && !customers.includes(customer) && (
              <option value={customer}>{customer}</option>
            )}
            {customers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1">
          {filtering && (
            <Button variant="secondary" onClick={onClear} className="sm:hidden">
              ล้างตัวกรอง
            </Button>
          )}
          <div className="ml-auto">
            <SegmentedControl
              label="รูปแบบการแสดงผล"
              value={view}
              onChange={onView}
              options={[
                {
                  value: 'grid',
                  label: 'แสดงแบบการ์ด',
                  icon: <IconGrid />,
                  iconOnly: true,
                },
                {
                  value: 'list',
                  label: 'แสดงแบบรายการ',
                  icon: <IconList />,
                  iconOnly: true,
                },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project card / row (real API fields only; empty fields are omitted)
// ---------------------------------------------------------------------------

function locationText(p: Project): string | undefined {
  if (p.address) return p.address;
  if (p.location) {
    return `${p.location.lat.toFixed(5)}, ${p.location.lng.toFixed(5)}`;
  }
  return undefined;
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <Badge tone={PROJECT_STATUS_TONES[status]} dot>
      {PROJECT_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Workflow stage from the status (the API has no progress field). */
function StageBar({ status }: { status: ProjectStatus }) {
  const stage = projectStage(status);
  if (!stage) {
    return (
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        โครงการถูกยกเลิก
      </p>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-600 dark:text-zinc-400">ขั้นตอนงาน</span>
        <span className="font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
          {stage.step}/{stage.of}
        </span>
      </div>
      <div
        role="img"
        aria-label={`ขั้นตอนที่ ${stage.step} จาก ${stage.of}: ${PROJECT_STATUS_LABELS[status]}`}
        className="mt-2 flex gap-1"
      >
        {Array.from({ length: stage.of }, (_, i) => (
          <span
            key={i}
            className={cx(
              'h-1.5 flex-1 rounded-full',
              i < stage.step
                ? status === 'completed'
                  ? 'bg-emerald-500'
                  : 'bg-indigo-500'
                : 'bg-zinc-200 dark:bg-zinc-800',
            )}
          />
        ))}
      </div>
    </div>
  );
}

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex min-w-0 items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      <span className="text-zinc-400 dark:text-zinc-500">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </p>
  );
}

function ProjectCard({ project: p }: { project: Project }) {
  const where = locationText(p);
  return (
    <article className="group relative flex h-full flex-col rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus-within:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-500/60">
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 text-base font-semibold leading-snug">
          {/* Stretched link: the whole card opens the project. */}
          <Link
            href={`/projects/${p.id}`}
            className="line-clamp-2 break-words after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none group-focus-within:text-indigo-700 dark:group-focus-within:text-indigo-300"
          >
            {p.name}
          </Link>
        </h2>
        <StatusBadge status={p.status} />
      </div>
      <div className="mt-3 space-y-1.5">
        {p.customerName && (
          <Meta icon={<IconBuilding className="size-4" />}>
            {p.customerName}
          </Meta>
        )}
        {where && <Meta icon={<IconPin className="size-4" />}>{where}</Meta>}
        {p.cameras && (
          <Meta icon={<IconCamera className="size-4" />}>
            {cameraText(p.cameras)}
          </Meta>
        )}
      </div>
      <div className="mb-5 mt-5 space-y-4">
        <StageBar status={p.status} />
        {p.cameras && p.cameras.total > 0 && (
          <div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              สถานะจุดกล้อง
            </p>
            <CameraMix summary={p.cameras} className="mt-2" />
          </div>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <IconClock className="size-3.5" />
          อัปเดต {formatDate(p.updatedAt)}
        </p>
        <span
          aria-hidden
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 dark:text-indigo-300"
        >
          เปิดโครงการ
          <IconArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </article>
  );
}

function ProjectRow({ project: p }: { project: Project }) {
  const where = locationText(p);
  return (
    <article className="group relative flex flex-col gap-3 p-4 transition-colors hover:bg-zinc-50 focus-within:bg-zinc-50 sm:flex-row sm:items-center sm:gap-6 sm:px-5 dark:hover:bg-zinc-800/50 dark:focus-within:bg-zinc-800/50">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 font-semibold">
            <Link
              href={`/projects/${p.id}`}
              className="break-words after:absolute after:inset-0 focus-visible:outline-none group-focus-within:text-indigo-700 dark:group-focus-within:text-indigo-300"
            >
              {p.name}
            </Link>
          </h2>
          <StatusBadge status={p.status} />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
          {p.customerName && (
            <Meta icon={<IconBuilding className="size-4" />}>
              {p.customerName}
            </Meta>
          )}
          {where && <Meta icon={<IconPin className="size-4" />}>{where}</Meta>}
          {p.cameras && (
            <Meta icon={<IconCamera className="size-4" />}>
              {cameraText(p.cameras)}
            </Meta>
          )}
        </div>
      </div>
      <div className="sm:w-40">
        <StageBar status={p.status} />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-zinc-500 sm:w-32 dark:text-zinc-400">
        <IconClock className="size-3.5" />
        {formatDate(p.updatedAt)}
      </p>
      <span
        aria-hidden
        className="hidden text-indigo-600 sm:block dark:text-indigo-300"
      >
        <IconArrowRight />
      </span>
    </article>
  );
}

const cameraText = (c: ProjectCameraSummary) =>
  c.total === 0
    ? 'ยังไม่มีจุดกล้อง'
    : `กล้อง ${c.total.toLocaleString('th-TH')} ตัว`;

// ---------------------------------------------------------------------------
// Office overview (desktop): project status, camera points, recent updates.
// Phones skip it: surveyors go straight to the project list.
// ---------------------------------------------------------------------------

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function OfficeOverview({ projects }: { projects: Project[] }) {
  const byStatus = PROJECT_STATUSES.map((s) => ({
    status: s,
    count: projects.filter((p) => p.status === s).length,
  }));
  const max = Math.max(1, ...byStatus.map((b) => b.count));

  const cameras: ProjectCameraSummary = { total: 0, byStatus: {} };
  for (const p of projects) {
    if (!p.cameras) continue;
    cameras.total += p.cameras.total;
    for (const [k, n] of Object.entries(p.cameras.byStatus)) {
      const key = k as keyof ProjectCameraSummary['byStatus'];
      cameras.byStatus[key] = (cameras.byStatus[key] ?? 0) + (n ?? 0);
    }
  }

  const recent = [...projects]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  return (
    <div
      role="region"
      aria-label="ภาพรวมสำหรับสำนักงาน"
      className="mb-8 hidden gap-4 lg:grid lg:grid-cols-3"
    >
      <Panel title="สถานะโครงการ">
        <ul className="space-y-2.5">
          {byStatus.map((b) => (
            <li
              key={b.status}
              className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-3 text-sm"
            >
              <span className="truncate text-zinc-600 dark:text-zinc-400">
                {PROJECT_STATUS_LABELS[b.status]}
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <span
                  className={cx(
                    'block h-full rounded-full',
                    b.status === 'completed'
                      ? 'bg-emerald-500'
                      : 'bg-indigo-500',
                    b.count === 0 && 'hidden',
                  )}
                  style={{ width: `${(b.count / max) * 100}%` }}
                />
              </span>
              <span className="text-right font-medium tabular-nums">
                {b.count}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="ภาพรวมจุดกล้อง">
        <p className="text-3xl font-semibold tabular-nums tracking-tight">
          {cameras.total.toLocaleString('th-TH')}
          <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
            จุดในทุกโครงการ
          </span>
        </p>
        {cameras.total > 0 ? (
          <CameraMix summary={cameras} legend className="mt-4" />
        ) : (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            ยังไม่มีการสำรวจจุดกล้อง
          </p>
        )}
      </Panel>

      <Panel title="อัปเดตล่าสุด">
        <ol className="space-y-1">
          {recent.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 py-1.5 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:bg-zinc-800"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {p.name}
                  </span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                    {formatRelative(p.updatedAt)}
                  </span>
                </span>
                <StatusBadge status={p.status} />
              </Link>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
