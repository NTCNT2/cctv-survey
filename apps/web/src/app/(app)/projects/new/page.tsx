'use client';

import { useRouter } from 'next/navigation';
import { ProjectForm } from '@/components/project-form';
import { Card, Forbidden, PageHeader } from '@/components/ui';
import { useCreateProject } from '@/lib/queries';
import { useCan } from '@/lib/session';

export default function NewProjectPage() {
  const router = useRouter();
  const allowed = useCan('project:write');
  const create = useCreateProject();

  return (
    <>
      <PageHeader
        title="สร้างโปรเจกต์"
        back={{ href: '/projects', label: 'โปรเจกต์ทั้งหมด' }}
      />
      {allowed ? (
        <Card>
          <ProjectForm
            mode="create"
            cancelHref="/projects"
            onSubmit={async (v) => {
              const p = await create.mutateAsync(v);
              router.replace(`/projects/${p.id}`);
            }}
          />
        </Card>
      ) : (
        <Forbidden />
      )}
    </>
  );
}
