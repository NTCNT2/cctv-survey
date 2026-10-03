'use client';

import { useParams, useRouter } from 'next/navigation';
import { ProjectForm } from '@/components/project-form';
import {
  Card,
  ErrorState,
  Forbidden,
  PageHeader,
  Skeleton,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useProject, useUpdateProject } from '@/lib/queries';
import { useCan } from '@/lib/session';

export default function EditProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const allowed = useCan('project:write');
  const project = useProject(id);
  const update = useUpdateProject(id);
  const back = { href: `/projects/${id}`, label: 'กลับไปที่โครงการ' };

  if (!allowed) {
    return (
      <>
        <PageHeader title="แก้ไขโครงการ" back={back} />
        <Forbidden />
      </>
    );
  }
  return (
    <>
      <PageHeader title="แก้ไขโครงการ" back={back} />
      {project.isPending ? (
        <Skeleton />
      ) : project.isError ? (
        <ErrorState
          message={errorMessage(project.error)}
          onRetry={() => project.refetch()}
        />
      ) : (
        <Card>
          <ProjectForm
            mode="edit"
            initial={project.data}
            cancelHref={back.href}
            onSubmit={async (v) => {
              await update.mutateAsync(v);
              router.replace(back.href);
            }}
          />
        </Card>
      )}
    </>
  );
}
