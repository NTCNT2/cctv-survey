'use client';

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
import { useCreateSite, useProject } from '@/lib/queries';
import { useCan } from '@/lib/session';

export default function NewSitePage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const allowed = useCan('site:write');
  const project = useProject(projectId);
  const create = useCreateSite(projectId);
  const back = { href: `/projects/${projectId}`, label: 'กลับไปที่โปรเจกต์' };

  return (
    <>
      <PageHeader
        title="เพิ่ม Site"
        subtitle={project.data?.name}
        back={back}
      />
      {!allowed ? (
        <Forbidden />
      ) : project.isPending ? (
        <Skeleton />
      ) : project.isError ? (
        <ErrorState
          message={errorMessage(project.error)}
          onRetry={() => project.refetch()}
        />
      ) : (
        <Card>
          <SiteForm
            mode="create"
            projectId={projectId}
            cancelHref={back.href}
            onSubmit={async (v) => {
              await create.mutateAsync(v);
              router.replace(back.href);
            }}
          />
        </Card>
      )}
    </>
  );
}
