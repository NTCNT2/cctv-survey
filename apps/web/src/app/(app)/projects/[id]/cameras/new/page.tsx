'use client';

import { useParams, useRouter } from 'next/navigation';
import { CameraForm } from '@/components/camera-form';
import {
  Card,
  ErrorState,
  Forbidden,
  PageHeader,
  Skeleton,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useCreateCamera, useProject, useSites } from '@/lib/queries';
import { useCan } from '@/lib/session';

export default function NewCameraPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const allowed = useCan('camera:write');
  const project = useProject(projectId);
  const sites = useSites(projectId);
  const create = useCreateCamera(projectId);
  const back = { href: `/projects/${projectId}`, label: 'กลับไปที่โครงการ' };
  const failed = project.error ?? sites.error;

  return (
    <>
      <PageHeader
        title="เพิ่มกล้อง"
        subtitle={project.data?.name}
        back={back}
      />
      {!allowed ? (
        <Forbidden />
      ) : failed ? (
        <ErrorState
          message={errorMessage(failed)}
          onRetry={() => {
            void project.refetch();
            void sites.refetch();
          }}
        />
      ) : !project.data || !sites.data ? (
        <Skeleton />
      ) : (
        <Card>
          <CameraForm
            mode="create"
            projectId={projectId}
            sites={sites.data}
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
