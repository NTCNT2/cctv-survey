'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SECTION_IDS } from '@/components/camera-form';
import { Skeleton } from '@/components/ui';

/** Old address of the survey details: now part of the one camera form. */
export default function CameraSurveyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/cameras/${id}/edit#${SECTION_IDS.camera}`);
  }, [id, router]);
  return <Skeleton />;
}
