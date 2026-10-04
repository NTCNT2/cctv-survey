'use client';

import {
  CAMERA_STATUSES,
  CAMERA_TYPES,
  type CameraPoint,
  type CameraStatus,
  type Project,
  type Site,
} from '@cctv/shared';
import { useParams, useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { CameraMix } from '@/components/camera-mix';
import {
  IconCamera,
  IconCheck,
  IconClock,
  IconMap,
  IconSearch,
} from '@/components/icons';
import { ConfirmButton } from '@/components/confirm-button';
import {
  Badge,
  Card,
  DefinitionList,
  EmptyState,
  ErrorState,
  LinkButton,
  PageHeader,
  Skeleton,
  StatCard,
  Tabs,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import {
  CAMERA_STATUS_LABELS,
  CAMERA_STATUS_TONES,
  CAMERA_TYPE_LABELS,
  formatDate,
  formatDateTime,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
} from '@/lib/labels';
import {
  useCameras,
  useDeleteCamera,
  useDeleteProject,
  useDeleteSite,
  useProject,
  useSites,
} from '@/lib/queries';
import { useCan } from '@/lib/session';

const coords = (l?: { lat: number; lng: number }) =>
  l ? `${l.lat.toFixed(6)}, ${l.lng.toFixed(6)}` : undefined;

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const project = useProject(id);

  return project.isPending ? (
    <Skeleton lines={5} />
  ) : project.isError ? (
    <>
      <PageHeader
        title="โครงการ"
        back={{ href: '/projects', label: 'โครงการทั้งหมด' }}
      />
      <ErrorState
        message={errorMessage(project.error)}
        onRetry={() => project.refetch()}
      />
    </>
  ) : (
    <ProjectDetail project={project.data} />
  );
}

function ProjectDetail({ project }: { project: Project }) {
  const router = useRouter();
  const canWrite = useCan('project:write');
  const canDelete = useCan('project:delete');
  const del = useDeleteProject(project.id);
  const [tab, setTab] = useState<'cameras' | 'sites'>('cameras');

  return (
    <>
      <PageHeader
        title={project.name}
        back={{ href: '/projects', label: 'โครงการทั้งหมด' }}
        subtitle={
          <Badge tone={PROJECT_STATUS_TONES[project.status]} dot>
            {PROJECT_STATUS_LABELS[project.status]}
          </Badge>
        }
        actions={
          <>
            <LinkButton href={`/projects/${project.id}/map`}>
              <IconMap className="size-4" />
              แผนที่สำรวจ
            </LinkButton>
            {canWrite && (
              <LinkButton
                href={`/projects/${project.id}/edit`}
                variant="secondary"
              >
                แก้ไขโครงการ
              </LinkButton>
            )}
            {canDelete && (
              <ConfirmButton
                label="ลบโครงการ"
                title={`ลบโครงการ “${project.name}”?`}
                detail="ลบได้เฉพาะโครงการที่ไม่มี Site และกล้องแล้วเท่านั้น การลบไม่สามารถย้อนกลับได้"
                onConfirm={async () => {
                  await del.mutateAsync();
                  router.replace('/projects');
                }}
              />
            )}
          </>
        }
      />
      <Card className="mb-6">
        <DefinitionList
          items={[
            { label: 'ลูกค้า', value: project.customerName },
            { label: 'ที่อยู่', value: project.address },
            { label: 'พิกัด', value: coords(project.location) },
            { label: 'อัปเดตล่าสุด', value: formatDateTime(project.updatedAt) },
            { label: 'หมายเหตุ', value: project.notes },
          ]}
        />
      </Card>

      <div className="mb-4">
        <Tabs
          label="ข้อมูลในโครงการ"
          value={tab}
          onChange={setTab}
          panelId="project-panel"
          tabs={[
            { value: 'cameras', label: 'กล้อง' },
            { value: 'sites', label: 'Site' },
          ]}
        />
      </div>
      <div
        role="tabpanel"
        id="project-panel"
        aria-labelledby={`project-panel-tab-${tab}`}
      >
        {tab === 'cameras' ? (
          <CameraList projectId={project.id} />
        ) : (
          <SiteList projectId={project.id} />
        )}
      </div>
    </>
  );
}

function SiteList({ projectId }: { projectId: string }) {
  const sites = useSites(projectId);
  const canWrite = useCan('site:write');
  const canDelete = useCan('site:delete');
  const del = useDeleteSite(projectId);
  const add = canWrite ? (
    <LinkButton href={`/projects/${projectId}/sites/new`}>
      + เพิ่ม Site
    </LinkButton>
  ) : null;

  if (sites.isPending) return <Skeleton />;
  if (sites.isError) {
    return (
      <ErrorState
        message={errorMessage(sites.error)}
        onRetry={() => sites.refetch()}
      />
    );
  }
  if (sites.data.length === 0) {
    return (
      <EmptyState
        title="ยังไม่มี Site"
        detail="Site คืออาคาร พื้นที่ หรือชั้นที่สำรวจภายในโครงการ"
        action={add}
      />
    );
  }
  return (
    <>
      {add && <div className="mb-3 flex justify-end">{add}</div>}
      <ul className="space-y-3" aria-label="รายการ Site">
        {sites.data.map((s: Site) => (
          <li key={s.id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-medium">{s.name}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {[
                      s.address,
                      coords(s.location),
                      s.boundary && `ขอบเขต ${s.boundary.length} จุด`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canWrite && (
                    <LinkButton
                      href={`/sites/${s.id}/edit`}
                      variant="secondary"
                    >
                      แก้ไข
                    </LinkButton>
                  )}
                  {canDelete && (
                    <ConfirmButton
                      label="ลบ"
                      title={`ลบ Site “${s.name}”?`}
                      detail="ลบได้เมื่อไม่มีกล้องผูกกับ Site นี้แล้ว"
                      onConfirm={() => del.mutateAsync(s.id)}
                    />
                  )}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

const filterControl =
  'min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-base shadow-sm focus:border-indigo-500 focus:outline-2 focus:outline-indigo-500/30 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900';

function FilterSelect({
  label,
  value,
  onChange,
  all,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  all: string;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={filterControl}
      >
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Camera totals by survey status (real data from the camera list). */
function CameraOverview({ cameras }: { cameras: CameraPoint[] }) {
  const count = (s: CameraStatus) =>
    cameras.filter((c) => c.status === s).length;
  const units = cameras.reduce((n, c) => n + (c.cameraCount ?? 1), 0);
  const summary = {
    total: cameras.length,
    byStatus: Object.fromEntries(
      CAMERA_STATUSES.map((s) => [s, count(s)]).filter(([, n]) => n),
    ),
  };
  const issues = count('issue');
  return (
    <section aria-label="ภาพรวมจุดกล้อง" className="mb-6">
      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="จุดกล้องทั้งหมด"
          value={cameras.length.toLocaleString('th-TH')}
          icon={<IconCamera />}
          tone="violet"
          hint={`รวม ${units.toLocaleString('th-TH')} ตัว`}
        />
        <StatCard
          label="สำรวจแล้ว"
          value={count('surveyed').toLocaleString('th-TH')}
          icon={<IconSearch />}
          tone="blue"
        />
        <StatCard
          label="รอติดตั้ง"
          value={count('pending_install').toLocaleString('th-TH')}
          icon={<IconClock />}
          tone="violet"
        />
        <StatCard
          label="ติดตั้งแล้ว"
          value={count('installed').toLocaleString('th-TH')}
          icon={<IconCheck />}
          tone="green"
          hint={issues ? `มีปัญหา ${issues} จุด` : undefined}
        />
      </dl>
      <CameraMix summary={summary} legend className="mt-4 sm:max-w-md" />
    </section>
  );
}

function cameraLine(c: CameraPoint): string {
  return [
    CAMERA_TYPE_LABELS[c.type],
    [c.brand, c.model].filter(Boolean).join(' '),
    c.resolutionMp !== undefined && `${c.resolutionMp}MP`,
    (c.cameraCount ?? 1) > 1 && `×${c.cameraCount}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function CameraList({ projectId }: { projectId: string }) {
  const cameras = useCameras(projectId);
  const sites = useSites(projectId);
  const canWrite = useCan('camera:write');
  const canDelete = useCan('camera:delete');
  const del = useDeleteCamera(projectId);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [area, setArea] = useState('');
  const [surveyor, setSurveyor] = useState('');
  const searchId = useId();
  const siteName = new Map((sites.data ?? []).map((s) => [s.id, s.name]));
  const add = canWrite ? (
    <LinkButton href={`/projects/${projectId}/cameras/new`}>
      + เพิ่มกล้อง
    </LinkButton>
  ) : null;

  if (cameras.isPending) return <Skeleton />;
  if (cameras.isError) {
    return (
      <ErrorState
        message={errorMessage(cameras.error)}
        onRetry={() => cameras.refetch()}
      />
    );
  }
  if (cameras.data.length === 0) {
    return <EmptyState title="ยังไม่มีกล้องในโครงการนี้" action={add} />;
  }

  const surveyors = [
    ...new Set(cameras.data.flatMap((c) => c.surveyorName ?? [])),
  ].sort((a, b) => a.localeCompare(b, 'th'));
  const needle = q.trim().toLocaleLowerCase('th');
  const shown = cameras.data.filter(
    (c) =>
      (!status || c.status === status) &&
      (!type || c.type === type) &&
      (!area || (area === '-' ? !c.siteId : c.siteId === area)) &&
      (!surveyor || c.surveyorName === surveyor) &&
      (!needle ||
        [c.label, c.address, c.brand, c.model].some((v) =>
          v?.toLocaleLowerCase('th').includes(needle),
        )),
  );
  const filtering = Boolean(needle || status || type || area || surveyor);

  return (
    <>
      <CameraOverview cameras={cameras.data} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <label htmlFor={searchId} className="sr-only">
            ค้นหาจุดกล้อง
          </label>
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
            <IconSearch className="size-4" />
          </span>
          <input
            id={searchId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหารหัสจุด ที่อยู่ ยี่ห้อ หรือรุ่น"
            className={`${filterControl} pl-9`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[38rem]">
          <FilterSelect
            label="กรองตามสถานะ"
            value={status}
            onChange={setStatus}
            all="ทุกสถานะ"
            options={CAMERA_STATUSES.map((s) => ({
              value: s,
              label: CAMERA_STATUS_LABELS[s],
            }))}
          />
          <FilterSelect
            label="กรองตามประเภทกล้อง"
            value={type}
            onChange={setType}
            all="ทุกประเภท"
            options={CAMERA_TYPES.map((t) => ({
              value: t,
              label: CAMERA_TYPE_LABELS[t],
            }))}
          />
          <FilterSelect
            label="กรองตามพื้นที่"
            value={area}
            onChange={setArea}
            all="ทุกพื้นที่"
            options={[
              ...(sites.data ?? []).map((s) => ({
                value: s.id,
                label: s.name,
              })),
              { value: '-', label: 'ไม่ระบุพื้นที่' },
            ]}
          />
          <FilterSelect
            label="กรองตามผู้สำรวจ"
            value={surveyor}
            onChange={setSurveyor}
            all="ผู้สำรวจทุกคน"
            options={surveyors.map((n) => ({ value: n, label: n }))}
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p
          className="text-sm text-zinc-600 dark:text-zinc-400"
          role={filtering ? 'status' : undefined}
        >
          {filtering
            ? `แสดง ${shown.length} จาก ${cameras.data.length} จุด`
            : `ทั้งหมด ${cameras.data.length} จุด`}
        </p>
        {add}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title="ไม่พบจุดกล้องที่ตรงกับเงื่อนไข"
          detail="ลองเปลี่ยนคำค้นหาหรือตัวกรอง"
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {/* Column titles (desktop); each row repeats them for screen readers. */}
          <div
            aria-hidden
            className="hidden grid-cols-[minmax(8rem,1.1fr)_minmax(10rem,1.4fr)_minmax(9rem,1.2fr)_8rem_8rem_7rem_auto] gap-4 border-b border-zinc-200/80 bg-zinc-50 px-5 py-2.5 text-xs font-medium text-zinc-500 lg:grid dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-400"
          >
            <span>รหัสจุด</span>
            <span>ตำแหน่ง</span>
            <span>กล้อง</span>
            <span>สถานะ</span>
            <span>ผู้สำรวจ</span>
            <span>อัปเดต</span>
            <span className="w-32" />
          </div>
          <ul
            aria-label="รายการกล้อง"
            className="divide-y divide-zinc-200/80 dark:divide-zinc-800"
          >
            {shown.map((c) => (
              <li
                key={c.id}
                className="grid gap-x-4 gap-y-2 p-4 sm:px-5 lg:grid-cols-[minmax(8rem,1.1fr)_minmax(10rem,1.4fr)_minmax(9rem,1.2fr)_8rem_8rem_7rem_auto] lg:items-center"
              >
                <div className="flex min-w-0 items-center justify-between gap-2 lg:block">
                  <p className="break-all font-semibold">{c.label}</p>
                  <span className="lg:hidden">
                    <Badge tone={CAMERA_STATUS_TONES[c.status]} dot>
                      {CAMERA_STATUS_LABELS[c.status]}
                    </Badge>
                  </span>
                </div>
                <div className="min-w-0 text-sm text-zinc-600 dark:text-zinc-400">
                  <p className="truncate">
                    {[c.siteId && (siteName.get(c.siteId) ?? 'Site'), c.address]
                      .filter(Boolean)
                      .join(' · ') || coords(c.location)}
                  </p>
                  {(c.siteId || c.address) && (
                    <p className="truncate text-xs text-zinc-500">
                      {coords(c.location)}
                    </p>
                  )}
                </div>
                <div className="min-w-0 text-sm">
                  <p className="truncate">{cameraLine(c)}</p>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {[
                      c.bearingDeg !== undefined && `ทิศ ${c.bearingDeg}°`,
                      c.fovDeg !== undefined && `FOV ${c.fovDeg}°`,
                      c.mountHeightM !== undefined &&
                        `สูง ${c.mountHeightM} ม.`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="hidden lg:block">
                  <Badge tone={CAMERA_STATUS_TONES[c.status]} dot>
                    {CAMERA_STATUS_LABELS[c.status]}
                  </Badge>
                </div>
                <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="lg:hidden">ผู้สำรวจ: </span>
                  {c.surveyorName ?? '—'}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="lg:hidden">อัปเดต </span>
                  {formatDate(c.updatedAt)}
                </p>
                <div className="flex flex-wrap gap-2 lg:w-32 lg:justify-end">
                  {canWrite && (
                    <LinkButton
                      href={`/cameras/${c.id}/edit`}
                      variant="secondary"
                    >
                      แก้ไข
                    </LinkButton>
                  )}
                  {canDelete && (
                    <ConfirmButton
                      label="ลบ"
                      title={`ลบกล้อง “${c.label}”?`}
                      onConfirm={() => del.mutateAsync(c.id)}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
