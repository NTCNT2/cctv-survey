'use client';

import Link from 'next/link';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LinkButton,
  PageHeader,
  Skeleton,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { formatDateTime, PROJECT_STATUS_LABELS } from '@/lib/labels';
import { useProjects } from '@/lib/queries';
import { useCan } from '@/lib/session';

export default function ProjectsPage() {
  const canCreate = useCan('project:write');
  const projects = useProjects();
  const createButton = canCreate ? (
    <LinkButton href="/projects/new">+ สร้างโปรเจกต์</LinkButton>
  ) : null;

  return (
    <>
      <PageHeader title="โปรเจกต์" actions={createButton} />
      {projects.isPending ? (
        <Skeleton lines={4} />
      ) : projects.isError ? (
        <ErrorState
          message={errorMessage(projects.error)}
          onRetry={() => projects.refetch()}
        />
      ) : projects.data.length === 0 ? (
        <EmptyState
          title="ยังไม่มีโปรเจกต์"
          detail={
            canCreate
              ? 'เริ่มต้นด้วยการสร้างโปรเจกต์แรก'
              : 'เมื่อมีการสร้างโปรเจกต์ รายการจะแสดงที่นี่'
          }
          action={createButton}
        />
      ) : (
        <>
          <ul className="space-y-3" aria-label="รายการโปรเจกต์">
            {projects.data.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="block rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-sky-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-sky-600"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0 break-words font-medium">
                      {p.name}
                    </span>
                    <Badge>{PROJECT_STATUS_LABELS[p.status]}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {p.customerName && <span>ลูกค้า: {p.customerName}</span>}
                    <span>อัปเดต {formatDateTime(p.updatedAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {projects.hasNextPage && (
            <div className="mt-4 flex justify-center">
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
