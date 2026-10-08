'use client';

import type { CameraPoint } from '@cctv/shared';
import { useParams, useRouter } from 'next/navigation';
import { CameraForm } from './camera-form';
import { ErrorState, Forbidden, PageHeader, Skeleton } from './ui';
import { errorMessage } from '@/lib/api';
import {
  useCamera,
  useCameraModels,
  useSites,
  useUpdateCamera,
} from '@/lib/queries';
import { useCan } from '@/lib/session';

const allProjects = { href: '/projects', label: 'โครงการทั้งหมด' };

const TITLE = 'แก้ไขข้อมูลกล้อง';

/**
 * The whole camera form for an existing point (/cameras/[id]/edit). The
 * survey detail has its own page (/cameras/[id]/survey). Saving goes back
 * to the camera.
 */
export function EditCameraPart() {
  const { id } = useParams<{ id: string }>();
  const allowed = useCan('camera:write');
  // The form starts from what is in the database now, not a cached copy.
  const camera = useCamera(id, { fresh: true });
  const title = TITLE;

  return !allowed ? (
    <>
      <PageHeader title={title} back={allProjects} />
      <Forbidden />
    </>
  ) : camera.isPending || (camera.isFetching && !camera.isFetchedAfterMount) ? (
    <Skeleton />
  ) : camera.isError ? (
    <>
      <PageHeader title={title} back={allProjects} />
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
  const models = useCameraModels();
  const update = useUpdateCamera(camera.id, camera.projectId);
  const back = { href: `/cameras/${camera.id}`, label: camera.label };
  const failed = sites.error ?? models.error;

  return (
    <>
      <PageHeader title={`${TITLE}: ${camera.label}`} back={back} />
      {failed ? (
        <ErrorState
          message={errorMessage(failed)}
          onRetry={() => {
            void sites.refetch();
            void models.refetch();
          }}
        />
      ) : !sites.data || !models.data ? (
        <Skeleton />
      ) : (
        <div className="mx-auto max-w-3xl">
          <CameraForm
            mode="edit"
            projectId={camera.projectId}
            sites={sites.data}
            models={models.data}
            initial={camera}
            cancelHref={back.href}
            onSubmit={async (v) => {
              // Nothing changed: no request.
              if (Object.keys(v).length > 0) await update.mutateAsync(v);
              router.replace(back.href);
            }}
          />
        </div>
      )}
    </>
  );
}
