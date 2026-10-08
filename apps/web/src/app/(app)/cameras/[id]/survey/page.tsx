'use client';

import type { CameraPoint } from '@cctv/shared';
import { useParams, useRouter } from 'next/navigation';
import { SurveyForm } from '@/components/survey-form';
import { ErrorState, Forbidden, PageHeader, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useCamera, useUpdateCamera } from '@/lib/queries';
import { useCan } from '@/lib/session';

const allProjects = { href: '/projects', label: 'โครงการทั้งหมด' };
const TITLE = 'รายละเอียด Survey';

/**
 * Survey detail of a camera point (the 15 items). Saving goes back to the
 * camera, which then shows the new "รายละเอียด Survey (n/9)" (main items).
 */
export default function CameraSurveyPage() {
  const { id } = useParams<{ id: string }>();
  const allowed = useCan('camera:write');
  // The form starts from what is in the database now, not a cached copy.
  const camera = useCamera(id, { fresh: true });

  return !allowed ? (
    <>
      <PageHeader title={TITLE} back={allProjects} />
      <Forbidden />
    </>
  ) : camera.isPending || (camera.isFetching && !camera.isFetchedAfterMount) ? (
    <Skeleton />
  ) : camera.isError ? (
    <>
      <PageHeader title={TITLE} back={allProjects} />
      <ErrorState
        message={errorMessage(camera.error)}
        onRetry={() => camera.refetch()}
      />
    </>
  ) : (
    <Survey camera={camera.data} />
  );
}

function Survey({ camera }: { camera: CameraPoint }) {
  const router = useRouter();
  const update = useUpdateCamera(camera.id, camera.projectId);
  const back = { href: `/cameras/${camera.id}`, label: camera.label };
  return (
    <>
      <PageHeader title={`${TITLE}: ${camera.label}`} back={back} />
      <div className="mx-auto max-w-3xl">
        <SurveyForm
          camera={camera}
          cancelHref={back.href}
          onSubmit={async (v) => {
            // Nothing changed: no request.
            if (Object.keys(v).length > 0) await update.mutateAsync(v);
            router.replace(back.href);
          }}
        />
      </div>
    </>
  );
}
