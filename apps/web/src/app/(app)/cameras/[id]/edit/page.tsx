'use client';

import type { CameraPoint } from '@cctv/shared';
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
import { useCamera, useSites, useUpdateCamera } from '@/lib/queries';
import { useCan } from '@/lib/session';

const allProjects = { href: '/projects', label: 'โครงการทั้งหมด' };

export default function EditCameraPage() {
  const { id } = useParams<{ id: string }>();
  const allowed = useCan('camera:write');
  // The form starts from what is in the database now, not a cached copy.
  const camera = useCamera(id, { fresh: true });

  return !allowed ? (
    <>
      <PageHeader title="แก้ไขกล้อง" back={allProjects} />
      <Forbidden />
    </>
  ) : camera.isPending || (camera.isFetching && !camera.isFetchedAfterMount) ? (
    <Skeleton />
  ) : camera.isError ? (
    <>
      <PageHeader title="แก้ไขกล้อง" back={allProjects} />
      <ErrorState
        message={errorMessage(camera.error)}
        onRetry={() => camera.refetch()}
      />
    </>
  ) : (
    <EditCamera camera={camera.data} />
  );
}

function EditCamera({ camera }: { camera: CameraPoint }) {
  const router = useRouter();
  const sites = useSites(camera.projectId);
  const update = useUpdateCamera(camera.id, camera.projectId);
  const back = {
    href: `/projects/${camera.projectId}`,
    label: 'กลับไปที่โครงการ',
  };

  return (
    <>
      <PageHeader title={`แก้ไขกล้อง: ${camera.label}`} back={back} />
      {sites.isPending ? (
        <Skeleton />
      ) : sites.isError ? (
        <ErrorState
          message={errorMessage(sites.error)}
          onRetry={() => sites.refetch()}
        />
      ) : (
        <Card>
          <CameraForm
            mode="edit"
            projectId={camera.projectId}
            sites={sites.data}
            initial={camera}
            cancelHref={back.href}
            onSubmit={async (v) => {
              // Nothing changed: no request.
              if (Object.keys(v).length > 0) await update.mutateAsync(v);
              router.replace(back.href);
            }}
          />
        </Card>
      )}
    </>
  );
}
