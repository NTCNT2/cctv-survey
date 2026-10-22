'use client';

import Link from 'next/link';
import { IconArrowRight, IconReport } from '@/components/icons';
import { PageHero } from '@/components/page-hero';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  toneBar,
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
      <PageHero
        title="รายงาน"
        subtitle="สรุปผลสำรวจ รายการอุปกรณ์ และรายละเอียดทุกจุด — ดาวน์โหลด CSV หรือพิมพ์เป็น PDF"
      />
      {/* The first card overlaps the header band (as on the dashboard). */}
      <div className="relative -mt-8 px-1 sm:px-3">
        {/* Loading / error / empty sit on a card too: the band is behind. */}
        {overview.isPending ? (
          <Card>
            <Skeleton />
          </Card>
        ) : overview.isError ? (
          <Card>
            <ErrorState
              message={errorMessage(overview.error)}
              onRetry={() => overview.refetch()}
            />
          </Card>
        ) : projects.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconReport className="size-6" />}
              title="ยังไม่มีโครงการ"
              detail="รายงานจะแสดงเมื่อมีโครงการและจุดกล้อง"
            />
          </Card>
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
              className="-my-1 divide-y divide-zinc-100"
            >
              {projects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/reports/${p.id}`}
                    className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-2 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-nt-charcoal active:bg-nt-yellow-soft"
                  >
                    {/* Status stripe, as on the project cards. */}
                    <span
                      aria-hidden
                      className={`w-1 self-stretch rounded-full ${toneBar[PROJECT_STATUS_TONES[p.status]]}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-zinc-900">
                        {p.name}
                      </span>
                      <span className="block truncate text-xs text-zinc-500">
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
      </div>
    </>
  );
}
