'use client';

import type { Site } from '@cctv/shared';
import { useParams, useRouter } from 'next/navigation';
import { SiteForm } from '@/components/site-form';
import {
  Card,
  ErrorState,
  Forbidden,
  PageHeader,
  Skeleton,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useSite, useUpdateSite } from '@/lib/queries';
import { useCan } from '@/lib/session';

export default function EditSitePage() {
  const { id } = useParams<{ id: string }>();
  const allowed = useCan('site:write');
  const site = useSite(id);

  return !allowed ? (
    <>
      <PageHeader
        title="แก้ไข Site"
        back={{ href: '/projects', label: 'โครงการทั้งหมด' }}
      />
      <Forbidden />
    </>
  ) : site.isPending ? (
    <Skeleton />
  ) : site.isError ? (
    <>
      <PageHeader
        title="แก้ไข Site"
        back={{ href: '/projects', label: 'โครงการทั้งหมด' }}
      />
      <ErrorState
        message={errorMessage(site.error)}
        onRetry={() => site.refetch()}
      />
    </>
  ) : (
    <EditSite site={site.data} />
  );
}

function EditSite({ site }: { site: Site }) {
  const router = useRouter();
  const update = useUpdateSite(site.id, site.projectId);
  const back = {
    href: `/projects/${site.projectId}`,
    label: 'กลับไปที่โครงการ',
  };
  return (
    <>
      <PageHeader title={`แก้ไข Site: ${site.name}`} back={back} />
      <Card>
        <SiteForm
          mode="edit"
          projectId={site.projectId}
          initial={site}
          cancelHref={back.href}
          onSubmit={async (v) => {
            await update.mutateAsync(v);
            router.replace(back.href);
          }}
        />
      </Card>
    </>
  );
}
