'use client'; // Error boundaries must be Client Components

import { ErrorState } from '@/components/ui';

/** Unexpected rendering errors. Data errors are handled on each page. */
export default function Error({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-16">
      <ErrorState message="เกิดข้อผิดพลาดในการแสดงผล" onRetry={() => retry()} />
    </main>
  );
}
