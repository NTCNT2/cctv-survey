'use client';

import Link from 'next/link';
import { IconArrowRight } from '@/components/icons';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_TONES } from '@/lib/labels';
import { useProjectOverview } from '@/lib/queries';

/** Reports: choose a project (newest first). */
export default function ReportsPage() {
  const overview = useProjectOverview();
  const projects = overview.data?.projects ?? [];

  return (
    <>
      <PageHeader
        title="รายงาน"
        subtitle="สรุปผลสำรวจ รายการอุปกรณ์ และรายละเอียดทุกจุด — ดาวน์โหลด CSV หรือพิมพ์เป็น PDF"
      />
      {overview.isPending ? (
        <Skeleton />
      ) : overview.isError ? (
        <ErrorState
          message={errorMessage(overview.error)}
          onRetry={() => overview.refetch()}
        />
      ) : projects.length === 0 ? (
        <EmptyState title="ยังไม่มีโครงการ" />
      ) : (
        <Card>
          {overview.data?.truncated && (
            <div className="mb-3">
              <Alert tone="info">แสดงเฉพาะโครงการล่าสุด</Alert>
            </div>
          )}
          <h2 className="mb-2 text-base font-semibold">เลือกโครงการ</h2>
          <ul
            aria-label="โครงการสำหรับรายงาน"
            className="-my-1 divide-y divide-zinc-100 dark:divide-zinc-800"
          >
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/reports/${p.id}`}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:bg-zinc-800"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {[p.customerName, `${p.cameras?.total ?? 0} จุดกล้อง`]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge tone={PROJECT_STATUS_TONES[p.status]}>
                      {PROJECT_STATUS_LABELS[p.status]}
                    </Badge>
                    <IconArrowRight className="size-4 text-zinc-400" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
