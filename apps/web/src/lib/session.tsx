'use client';

import { can, type Action, type AuthUser } from '@cctv/shared';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import { api } from './api';

export const ME_KEY = ['auth', 'me'] as const;

/**
 * The signed-in user, from GET /api/auth/me. The session cookie is HttpOnly
 * and scoped to /api, so the browser-side code can only learn who is signed in
 * by asking the API — which stays the single source of truth.
 */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: api.auth.me,
    retry: false,
    // Short: a role change or deactivation shows up in the UI within 15 s
    // (the API enforces it immediately either way).
    staleTime: 15_000,
    // A 401 here is the normal "not signed in" answer, not a session expiry.
    meta: { skipAuthRedirect: true },
  });
}

const SessionContext = createContext<AuthUser | null>(null);

export const SessionProvider = SessionContext.Provider;

/** The signed-in user; only valid below the (app) layout's session gate. */
export function useSession(): AuthUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error('useSession() used outside the session gate');
  return user;
}

/**
 * Whether the UI should offer an action. Only hides buttons — the API decides
 * (and re-checks every request) whether the action is allowed.
 */
export function useCan(action: Action): boolean {
  return can(useSession().role, action);
}

/**
 * Goes to the login page with a full page load. That throws away every
 * cached response in memory, so nothing from this session can be shown again
 * (not even via the back button) — the next page asks the API afresh.
 */
export function leaveToLogin(
  reason: { expired?: boolean; loggedOut?: boolean; changed?: boolean } = {},
) {
  const here = window.location.pathname + window.location.search;
  const params = new URLSearchParams();
  if (reason.expired) {
    params.set('expired', '1');
    if (!here.startsWith('/login')) params.set('next', here);
  }
  if (reason.loggedOut) params.set('loggedOut', '1');
  if (reason.changed) params.set('changed', '1');
  if (window.location.pathname === '/login' && reason.expired) return;
  const qs = params.toString();
  window.location.replace(`/login${qs ? `?${qs}` : ''}`);
}
