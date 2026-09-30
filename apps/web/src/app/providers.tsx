'use client';

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { leaveToLogin } from '@/lib/session';

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { skipAuthRedirect?: boolean };
    mutationMeta: { skipAuthRedirect?: boolean };
  }
}

/**
 * Any 401 from a data request means the session ended (logout elsewhere,
 * password change, deactivation, expiry). Leave with a full page load, which
 * also discards every cached response.
 */
function onAuthError(err: unknown, meta?: { skipAuthRedirect?: boolean }) {
  if (!(err instanceof ApiError) || err.status !== 401) return;
  if (meta?.skipAuthRedirect) return;
  leaveToLogin({ expired: true });
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (err, query) => onAuthError(err, query.meta),
        }),
        mutationCache: new MutationCache({
          onError: (err, _v, _c, mutation) => onAuthError(err, mutation.meta),
        }),
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            // Retrying a 4xx never helps; retry network/5xx once.
            retry: (count, err) =>
              count < 1 &&
              !(
                err instanceof ApiError &&
                err.status >= 400 &&
                err.status < 500
              ),
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
