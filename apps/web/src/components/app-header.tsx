'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, logoutEndedSession } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/labels';
import { leaveToLogin, useSession } from '@/lib/session';
import { Alert, Badge, Button } from './ui';

export function AppHeader() {
  const user = useSession();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string>();

  async function logout() {
    setBusy(true);
    setLogoutError(undefined);
    let failure: unknown;
    try {
      await api.auth.logout();
    } catch (err) {
      failure = err ?? new Error('logout failed');
    }
    if (logoutEndedSession(failure)) {
      // Full page load: nothing cached for this user survives.
      leaveToLogin({ loggedOut: true });
      return;
    }
    // The session may still be valid: say so instead of pretending.
    setLogoutError(
      'ออกจากระบบไม่สำเร็จ (เชื่อมต่อเซิร์ฟเวอร์ไม่ได้) — คุณยังอยู่ในระบบ กรุณาลองอีกครั้ง',
    );
    setBusy(false);
  }

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <Link
          href="/projects"
          className="flex min-h-11 items-center font-semibold tracking-tight"
        >
          CCTV Survey
        </Link>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="user-menu"
            className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <span className="max-w-[10rem] truncate" data-testid="current-user">
              {user.displayName ?? user.username}
            </span>
            <Badge>{ROLE_LABELS[user.role]}</Badge>
          </button>
          {menuOpen && (
            <div
              id="user-menu"
              className="absolute right-0 mt-1 w-56 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            >
              {logoutError && (
                <div className="mb-2">
                  <Alert>{logoutError}</Alert>
                </div>
              )}
              <p className="truncate px-2 py-1 text-xs text-zinc-500">
                @{user.username}
              </p>
              <Link
                href="/account/password"
                onClick={() => setMenuOpen(false)}
                className="flex min-h-11 items-center rounded-lg px-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                เปลี่ยนรหัสผ่าน
              </Link>
              <Button
                variant="secondary"
                className="mt-1 w-full"
                onClick={logout}
                busy={busy}
              >
                ออกจากระบบ
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
