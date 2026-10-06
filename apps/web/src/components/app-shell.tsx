'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { can, type Action } from '@cctv/shared';
import { api, logoutEndedSession } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/labels';
import { leaveToLogin, useCan, useSession } from '@/lib/session';
import {
  IconBell,
  IconCamera,
  IconChevronDown,
  IconDashboard,
  IconFolder,
  IconKey,
  IconLogout,
  IconMap,
  IconReport,
  IconSearch,
  IconSettings,
  LogoMark,
} from './icons';
import { Alert, Badge, Button } from './ui';

const cx = (...c: (string | false | undefined)[]) =>
  c.filter(Boolean).join(' ');

interface NavItem {
  label: string;
  icon: (p: { className?: string }) => ReactNode;
  /** No href: the section is not built yet and is shown disabled. */
  href?: string;
  /** Path prefixes that mark the item as the current section. */
  match?: string[];
  /** Only users with this permission get the link (others: disabled). */
  permission?: Action;
}

/** NAV as this user sees it. */
function useNav(): NavItem[] {
  const user = useSession();
  return NAV.map((i) =>
    i.permission && !can(user.role, i.permission)
      ? { ...i, href: undefined, match: undefined }
      : i,
  );
}

const NAV: NavItem[] = [
  { label: 'แดชบอร์ด', icon: IconDashboard },
  {
    label: 'โครงการ',
    icon: IconFolder,
    href: '/projects',
    match: ['/projects', '/sites', '/cameras'],
  },
  { label: 'แผนที่สำรวจ', icon: IconMap },
  // Admins: the camera model master (ข้อมูลกล้อง). Others: not built yet.
  {
    label: 'กล้อง',
    icon: IconCamera,
    href: '/camera-models',
    match: ['/camera-models'],
    permission: 'camera_model:manage',
  },
  { label: 'รายงาน', icon: IconReport },
  {
    label: 'ตั้งค่า',
    icon: IconSettings,
    href: '/account/password',
    match: ['/account'],
  },
];

const isCurrent = (item: NavItem, pathname: string) =>
  item.match?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ??
  false;

/** Page context shown in the top header (the page itself has the <h1>). */
function sectionTitle(pathname: string): string {
  if (pathname.startsWith('/account')) return 'ตั้งค่าบัญชี';
  if (pathname.startsWith('/camera-models')) return 'ข้อมูลกล้อง';
  if (pathname.startsWith('/design-system')) return 'Design system';
  if (isImmersive(pathname)) return 'แผนที่สำรวจ';
  return 'โครงการ';
}

const initials = (name: string) => name.trim().slice(0, 1).toUpperCase();

/** The initial is drawn with CSS, so it is not part of the text content. */
function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      data-initial={initials(name)}
      className={cx(
        'grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-semibold text-white before:content-[attr(data-initial)]',
        size === 'sm' ? 'size-8' : 'size-9',
      )}
    />
  );
}

/**
 * Signed-in layout: sidebar (desktop), icon rail (tablet), top header and a
 * bottom navigation bar on phones. Sections without a page yet are disabled.
 */
/** Full-screen pages (the survey map): no page padding, own phone chrome. */
export const isImmersive = (pathname: string) =>
  /^\/projects\/[^/]+\/map$/.test(pathname);

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const immersive = isImmersive(pathname);
  return (
    <div className="flex min-h-full flex-1 bg-zinc-50 dark:bg-zinc-950">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-indigo-600 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        ข้ามไปยังเนื้อหาหลัก
      </a>
      <Sidebar pathname={pathname} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar pathname={pathname} immersive={immersive} />
        <main
          id="main"
          className={
            immersive
              ? 'relative flex-1'
              : 'mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 md:pb-10 lg:px-8 lg:pt-8'
          }
        >
          {children}
        </main>
      </div>
      {!immersive && <BottomNav pathname={pathname} />}
    </div>
  );
}

function Sidebar({ pathname }: { pathname: string }) {
  const user = useSession();
  const nav = useNav();
  return (
    <aside
      aria-label="เมนูหลัก"
      className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-zinc-200/80 bg-white md:flex md:w-[4.5rem] lg:w-64 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <Link
        href="/projects"
        className="flex h-16 items-center gap-3 px-4 lg:px-5"
        aria-label="CCTV Survey — หน้าโครงการ"
      >
        <LogoMark />
        <span className="hidden min-w-0 lg:block">
          <span className="block text-sm font-semibold tracking-tight">
            CCTV Survey
          </span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
            สำรวจและออกแบบระบบกล้อง
          </span>
        </span>
      </Link>
      <nav aria-label="เมนูหลัก" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {nav.map((item) => (
            <li key={item.label}>
              <SideLink item={item} current={isCurrent(item, pathname)} />
            </li>
          ))}
        </ul>
      </nav>
      <div className="border-t border-zinc-200/80 p-3 dark:border-zinc-800">
        <div className="flex items-center gap-3 rounded-xl px-1 py-1.5 lg:px-2">
          <Avatar name={user.displayName ?? user.username} />
          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-sm font-medium">
              {user.displayName ?? user.username}
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {ROLE_LABELS[user.role]}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function SideLink({ item, current }: { item: NavItem; current: boolean }) {
  const Icon = item.icon;
  const body = (
    <>
      <Icon />
      <span className="hidden flex-1 truncate lg:block">{item.label}</span>
      {!item.href && (
        <span className="hidden rounded-md bg-zinc-100 px-1.5 py-0.5 text-[0.7rem] font-medium text-zinc-500 lg:inline dark:bg-zinc-800 dark:text-zinc-400">
          เร็วๆ นี้
        </span>
      )}
    </>
  );
  const shell =
    'flex min-h-11 items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium lg:justify-start';
  if (!item.href) {
    return (
      <span
        aria-disabled="true"
        title={`${item.label} (เร็วๆ นี้)`}
        className={cx(
          shell,
          'cursor-not-allowed text-zinc-400 dark:text-zinc-500',
        )}
      >
        <span className="sr-only">{item.label} (เร็วๆ นี้)</span>
        {body}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={current ? 'page' : undefined}
      title={item.label}
      className={cx(
        shell,
        'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600',
        current
          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
          : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
      )}
    >
      <span className="sr-only lg:hidden">{item.label}</span>
      {body}
    </Link>
  );
}

function TopBar({
  pathname,
  immersive,
}: {
  pathname: string;
  immersive: boolean;
}) {
  return (
    <header
      className={cx(
        'sticky top-0 z-30 border-b border-zinc-200/80 bg-white/85 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/85',
        // Phones: the survey map draws its own top bar.
        immersive && 'hidden md:block',
      )}
    >
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/projects"
          className="flex items-center gap-2 md:hidden"
          aria-label="CCTV Survey — หน้าโครงการ"
        >
          <LogoMark />
        </Link>
        <p className="hidden min-w-0 truncate text-sm font-medium text-zinc-500 sm:block dark:text-zinc-400">
          CCTV Survey
          <span aria-hidden className="mx-2 text-zinc-300 dark:text-zinc-600">
            /
          </span>
          <span className="text-zinc-900 dark:text-zinc-100">
            {sectionTitle(pathname)}
          </span>
        </p>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Suspense fallback={<SearchBox />}>
            <HeaderSearch />
          </Suspense>
          <Notifications />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

/** Searches projects: submits to /projects?q=… (the list filters by it). */
function HeaderSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlQuery = pathname === '/projects' ? (params.get('q') ?? '') : '';
  return (
    <SearchBox
      key={urlQuery}
      defaultValue={urlQuery}
      onSearch={(q) =>
        router.push(q ? `/projects?q=${encodeURIComponent(q)}` : '/projects')
      }
    />
  );
}

function SearchBox({
  defaultValue = '',
  onSearch,
}: {
  defaultValue?: string;
  onSearch?: (q: string) => void;
}) {
  const id = useId();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get('q');
    onSearch?.(typeof q === 'string' ? q.trim() : '');
  }
  return (
    <form role="search" onSubmit={submit} className="hidden md:block">
      <label htmlFor={id} className="sr-only">
        ค้นหาโครงการ
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
          <IconSearch className="size-4" />
        </span>
        <input
          id={id}
          name="q"
          type="search"
          defaultValue={defaultValue}
          placeholder="ค้นหาโครงการ…"
          className="min-h-11 w-56 rounded-xl border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:bg-white focus:outline-2 focus:outline-indigo-500/30 lg:w-72 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:bg-zinc-900"
        />
      </div>
    </form>
  );
}

/** Closes a popover on Escape or a click outside `ref`. */
function useDismiss(
  open: boolean,
  close: () => void,
  ref: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, close, ref]);
}

const iconButton =
  'grid size-11 place-items-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100';

const popover =
  'absolute right-0 top-full z-40 mt-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl shadow-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900';

function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={iconButton}
        aria-label="การแจ้งเตือน"
        aria-expanded={open}
        aria-controls="notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <IconBell />
      </button>
      {open && (
        <div id="notifications" className={cx(popover, 'w-72 p-4')}>
          <p className="text-sm font-medium">การแจ้งเตือน</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            ยังไม่มีการแจ้งเตือน
          </p>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const user = useSession();
  const manageModels = useCan('camera_model:manage');
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string>();
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(menuOpen && !busy, () => setMenuOpen(false), ref);
  const name = user.displayName ?? user.username;

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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-controls="user-menu"
        aria-label={`เมนูผู้ใช้: ${name}`}
        className="flex min-h-11 items-center gap-2 rounded-xl px-1.5 text-sm transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:px-2 dark:hover:bg-zinc-800"
      >
        <span data-testid="current-user" className="flex items-center gap-2">
          <Avatar name={name} size="sm" />
          <span className="hidden max-w-[9rem] truncate font-medium sm:block">
            {name}
          </span>
        </span>
        <IconChevronDown className="hidden size-4 text-zinc-400 sm:block" />
      </button>
      {menuOpen && (
        <div id="user-menu" className={cx(popover, 'w-64')}>
          {logoutError && (
            <div className="mb-2">
              <Alert>{logoutError}</Alert>
            </div>
          )}
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar name={name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs text-zinc-500">@{user.username}</p>
            </div>
          </div>
          <div className="px-2 pb-2">
            <Badge tone="violet">{ROLE_LABELS[user.role]}</Badge>
          </div>
          <div className="border-t border-zinc-100 pt-1 dark:border-zinc-800">
            <Link
              href="/account/password"
              onClick={() => setMenuOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <IconKey className="size-4 text-zinc-500" />
              เปลี่ยนรหัสผ่าน
            </Link>
            {manageModels && (
              <Link
                href="/camera-models"
                onClick={() => setMenuOpen(false)}
                className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <IconCamera className="size-4 text-zinc-500" />
                ข้อมูลกล้อง (รุ่นกล้อง)
              </Link>
            )}
            <Button
              variant="secondary"
              className="mt-1 w-full"
              onClick={logout}
              busy={busy}
            >
              {!busy && <IconLogout className="size-4" />}
              ออกจากระบบ
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function BottomNav({ pathname }: { pathname: string }) {
  const items = useNav().filter((i) =>
    ['โครงการ', 'แผนที่สำรวจ', 'กล้อง', 'ตั้งค่า'].includes(i.label),
  );
  return (
    <nav
      aria-label="เมนูหลัก (มือถือ)"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden dark:border-zinc-800 dark:bg-zinc-900/95"
    >
      <ul className="grid grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          const current = isCurrent(item, pathname);
          const shell =
            'flex min-h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-medium';
          return (
            <li key={item.label}>
              {item.href ? (
                <Link
                  href={item.href}
                  aria-current={current ? 'page' : undefined}
                  className={cx(
                    shell,
                    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600',
                    current
                      ? 'text-indigo-700 dark:text-indigo-300'
                      : 'text-zinc-500 dark:text-zinc-400',
                  )}
                >
                  <Icon />
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className={cx(shell, 'text-zinc-300 dark:text-zinc-600')}
                >
                  <Icon />
                  {item.label}
                  <span className="sr-only">(เร็วๆ นี้)</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
