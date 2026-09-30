'use client';

import type { CameraPoint, Project, Site } from '@cctv/shared';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
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
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import {
  CAMERA_STATUS_LABELS,
  CAMERA_TYPE_LABELS,
  formatDateTime,
  PROJECT_STATUS_LABELS,
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
        title="โปรเจกต์"
        back={{ href: '/projects', label: 'โปรเจกต์ทั้งหมด' }}
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
        back={{ href: '/projects', label: 'โปรเจกต์ทั้งหมด' }}
        subtitle={<Badge>{PROJECT_STATUS_LABELS[project.status]}</Badge>}
        actions={
          <>
            {canWrite && (
              <LinkButton
                href={`/projects/${project.id}/edit`}
                variant="secondary"
              >
                แก้ไขโปรเจกต์
              </LinkButton>
            )}
            {canDelete && (
              <ConfirmButton
                label="ลบโปรเจกต์"
                title={`ลบโปรเจกต์ “${project.name}”?`}
                detail="ลบได้เฉพาะโปรเจกต์ที่ไม่มี Site และกล้องแล้วเท่านั้น การลบไม่สามารถย้อนกลับได้"
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

      <div
        role="tablist"
        aria-label="ข้อมูลในโปรเจกต์"
        className="mb-4 flex gap-2"
      >
        {(
          [
            ['cameras', 'กล้อง'],
            ['sites', 'Site'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-11 rounded-lg px-4 text-sm font-medium ${
              tab === key
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
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
        detail="Site คืออาคาร พื้นที่ หรือชั้นที่สำรวจภายในโปรเจกต์"
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

function CameraList({ projectId }: { projectId: string }) {
  const cameras = useCameras(projectId);
  const sites = useSites(projectId);
  const canWrite = useCan('camera:write');
  const canDelete = useCan('camera:delete');
  const del = useDeleteCamera(projectId);
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
    return <EmptyState title="ยังไม่มีกล้องในโปรเจกต์นี้" action={add} />;
  }
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          ทั้งหมด {cameras.data.length} ตัว
        </p>
        {add}
      </div>
      <ul className="space-y-3" aria-label="รายการกล้อง">
        {cameras.data.map((c: CameraPoint) => (
          <li key={c.id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="break-all">{c.label}</span>
                    <Badge>{CAMERA_TYPE_LABELS[c.type]}</Badge>
                    <Badge>{CAMERA_STATUS_LABELS[c.status]}</Badge>
                  </p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {[
                      c.siteId && (siteName.get(c.siteId) ?? 'Site'),
                      coords(c.location),
                      c.bearingDeg !== undefined && `ทิศ ${c.bearingDeg}°`,
                      c.fovDeg !== undefined && `FOV ${c.fovDeg}°`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
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
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
