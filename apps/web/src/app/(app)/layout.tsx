'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AppHeader } from '@/components/app-header';
import { ErrorState, Skeleton } from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api';
import { SessionProvider, useMe } from '@/lib/session';

/**
 * Session gate for every signed-in page. The session cookie is HttpOnly and
 * scoped to /api, so the only way to know who is signed in is to ask the API
 * (GET /api/auth/me). Every data request is authorised again by the API.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const unauthenticated =
    me.error instanceof ApiError && me.error.status === 401;

  useEffect(() => {
    if (unauthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [unauthenticated, pathname, router]);

  if (me.data) {
    return (
      <SessionProvider value={me.data}>
        <AppHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </SessionProvider>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
      {me.error && !unauthenticated ? (
        <ErrorState
          message={errorMessage(me.error)}
          onRetry={() => me.refetch()}
        />
      ) : (
        <Skeleton lines={4} />
      )}
    </main>
  );
}
