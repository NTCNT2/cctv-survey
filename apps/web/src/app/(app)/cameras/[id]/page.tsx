'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CameraDetail } from '@/components/camera-detail';
import {
  Alert,
  Card,
  ErrorState,
  LinkButton,
  PageHeader,
  Skeleton,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useCamera, useSites } from '@/lib/queries';
import { useCan } from '@/lib/session';

const allProjects = { href: '/projects', label: 'โครงการทั้งหมด' };

export default function CameraPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <CameraView />
    </Suspense>
  );
}

function CameraView() {
  const { id } = useParams<{ id: string }>();
  const photosFailed = Number(useSearchParams().get('photosFailed') ?? 0);
  const camera = useCamera(id);
  const canWrite = useCan('camera:write');
  const sites = useSites(camera.data?.projectId ?? '');
  const c = camera.data;

  if (camera.isPending) return <Skeleton />;
  if (camera.isError || !c) {
    return (
      <>
        <PageHeader title="กล้อง" back={allProjects} />
        <ErrorState
          message={errorMessage(camera.error)}
          onRetry={() => camera.refetch()}
        />
      </>
    );
  }
  return (
    <>
      <PageHeader
        title={c.label}
        back={{ href: `/projects/${c.projectId}`, label: 'กลับไปที่โครงการ' }}
        actions={
          <LinkButton href={`/projects/${c.projectId}/map`} variant="secondary">
            ดูบนแผนที่
          </LinkButton>
        }
      />
      {photosFailed > 0 && (
        <div className="mb-4">
          <Alert>
            บันทึกจุดกล้องแล้ว แต่อัปโหลดรูปไม่สำเร็จ {photosFailed} รูป — กด
            “เพิ่มรูป” เพื่อลองอีกครั้ง
          </Alert>
        </div>
      )}
      <Card>
        <CameraDetail
          camera={c}
          siteName={sites.data?.find((s) => s.id === c.siteId)?.name}
          canWrite={canWrite}
        />
      </Card>
    </>
  );
}
