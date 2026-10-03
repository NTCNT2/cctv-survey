'use client';

import type { Project, ProjectStatus } from '@cctv/shared';
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
  IconCheck,
  IconClock,
  IconFolder,
  IconGrid,
  IconList,
  IconPin,
  IconSearch,
} from '@/components/icons';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LinkButton,
  Skeleton,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import {
  formatDate,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
  projectStage,
} from '@/lib/labels';
import { useProjectOverview, useProjects } from '@/lib/queries';
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
  // 500) feeds the summary cards and every search / filter.
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
              {overview.data?.truncated && ' (ค้นหาจาก 500 โครงการล่าสุด)'}
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
  const cards: {
    label: string;
    value: number | undefined;
    icon: ReactNode;
    accent: string;
  }[] = [
    {
      label: 'โครงการทั้งหมด',
      value: count(),
      icon: <IconFolder />,
      accent:
        'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
    },
    {
      label: 'กำลังสำรวจ',
      value: count('surveying'),
      icon: <IconSearch />,
      accent: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
    },
    {
      label: 'เสร็จแล้ว',
      value: count('completed'),
      icon: <IconCheck />,
      accent:
        'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    },
    {
      label: 'แบบร่าง',
      value: count('draft'),
      icon: <IconClock />,
      accent: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
    },
  ];
  return (
    <section aria-label="สรุปโครงการ" className="mb-8">
      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="flex items-start justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="min-w-0">
              <dt className="text-sm text-zinc-600 dark:text-zinc-400">
                {c.label}
              </dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
                {c.value === undefined ? (
                  overview.isError ? (
                    <span title="โหลดข้อมูลสรุปไม่สำเร็จ">—</span>
                  ) : (
                    <>
                      <span
                        aria-hidden
                        className="inline-block h-8 w-12 animate-pulse rounded-lg bg-zinc-200/70 dark:bg-zinc-800"
                      />
                      <span className="sr-only">รอข้อมูล</span>
                    </>
                  )
                ) : (
                  `${c.value.toLocaleString('th-TH')}${c.value ? plus : ''}`
                )}
              </dd>
            </div>
            <span
              aria-hidden
              className={cx(
                'grid size-10 shrink-0 place-items-center rounded-xl',
                c.accent,
              )}
            >
              {c.icon}
            </span>
          </div>
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
          <div
            role="group"
            aria-label="รูปแบบการแสดงผล"
            className="ml-auto inline-flex rounded-xl border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {(
              [
                ['grid', 'แสดงแบบการ์ด', IconGrid],
                ['list', 'แสดงแบบรายการ', IconList],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                aria-label={label}
                aria-pressed={view === v}
                title={label}
                onClick={() => onView(v)}
                className={cx(
                  'grid size-11 place-items-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-indigo-600 sm:size-9',
                  view === v
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                    : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
                )}
              >
                <Icon />
              </button>
            ))}
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
      </div>
      <div className="mb-5 mt-5">
        <StageBar status={p.status} />
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
