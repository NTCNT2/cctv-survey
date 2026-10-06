'use client';

import { useParams, useRouter } from 'next/navigation';
import { CameraForm } from '@/components/camera-form';
import { ErrorState, Forbidden, PageHeader, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import {
  useCameraModels,
  useCameras,
  useCreateCamera,
  useProject,
  useSites,
} from '@/lib/queries';
import { useCan } from '@/lib/session';
import { nextPointCode } from '@/lib/survey';

/** Quick Add on a page (the survey map has the same form in a sheet). */
export default function NewCameraPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const allowed = useCan('camera:write');
  const project = useProject(projectId);
  const sites = useSites(projectId);
  const cameras = useCameras(projectId);
  const models = useCameraModels();
  const create = useCreateCamera(projectId);
  const back = { href: `/projects/${projectId}`, label: 'กลับไปที่โครงการ' };
  const failed = project.error ?? sites.error ?? models.error ?? cameras.error;

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
            void cameras.refetch();
            void models.refetch();
          }}
        />
      ) : !project.data || !sites.data || !models.data || !cameras.data ? (
        <Skeleton />
      ) : (
        <div className="mx-auto max-w-3xl">
          <CameraForm
            mode="create"
            projectId={projectId}
            sites={sites.data}
            models={models.data}
            initialLabel={nextPointCode(cameras.data.map((c) => c.label))}
            cancelHref={back.href}
            onSubmit={async (body, photos) => {
              const r = await create.mutateAsync({ body, photos });
              router.replace(
                `/cameras/${r.camera.id}${r.photosFailed ? `?photosFailed=${r.photosFailed}` : ''}`,
              );
            }}
          />
        </div>
      )}
    </>
  );
}
