'use client';

import { loginSchema } from '@cctv/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useEffect,
  useId,
  useState,
  type FocusEvent,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconEye,
  IconEyeOff,
  IconLock,
  IconUser,
} from '@/components/icons';
import { Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { safeNextPath, validate, type FieldErrors } from '@/lib/form';
import { ME_KEY, useMe } from '@/lib/session';

const cx = (...c: (string | false | undefined)[]) =>
  c.filter(Boolean).join(' ');

/**
 * Sign-in. Phones: the brand on the gradient, the form on a white sheet at
 * the bottom of the screen. From md: brand on the left, a form card (max
 * 420px) on the right.
 */
export default function LoginPage() {
  return (
    <main className="relative flex min-h-[100dvh] flex-1 flex-col overflow-hidden bg-linear-160 from-indigo-600 via-violet-700 to-violet-600 md:grid md:grid-cols-2 md:items-center md:gap-8 md:px-10 lg:px-16">
      <BrandArt variant="wide" />
      <Brand />
      <div className="relative z-10 mt-auto md:mt-0 md:flex md:justify-center">
        <section
          aria-labelledby="login-title"
          className="rounded-t-[32px] bg-white px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-7 text-zinc-900 shadow-[0_-12px_32px_rgba(30,27,75,0.25)] md:w-full md:max-w-[420px] md:rounded-[32px] md:p-8 md:shadow-2xl dark:bg-zinc-900 dark:text-zinc-100"
        >
          <h2 id="login-title" className="text-2xl font-bold tracking-tight">
            เข้าสู่ระบบ
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            ใช้บัญชีที่ได้รับจากผู้ดูแลระบบ
          </p>
          {/* useSearchParams needs a Suspense boundary (Next.js 16). */}
          <Suspense>
            <LoginForm />
          </Suspense>
          <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
            NT ชัยนาท · v{process.env.NEXT_PUBLIC_APP_VERSION}
          </p>
        </section>
      </div>
    </main>
  );
}

/** Logo, product line and headline over a faint map of camera points. */
function Brand() {
  return (
    <div className="relative px-6 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))] text-white md:px-0 md:py-16">
      <BrandArt variant="phone" />
      <div className="relative">
        <span
          aria-hidden
          className="grid size-[60px] place-items-center rounded-2xl border border-white/30 bg-white/20 shadow-lg shadow-indigo-950/20"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="size-8"
            focusable="false"
          >
            <path d="M4 9h16" />
            <path d="M6 9a6 6 0 0 0 12 0" />
            <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
          </svg>
        </span>
        {/* indigo-100, not 200: small text keeps >= 4.5:1 on the gradient. */}
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-indigo-100">
          CCTV Site Survey &amp; Design
        </p>
        <h1 className="mt-3 text-[2rem] font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
          สำรวจหน้างาน
          <br />
          ออกแบบระบบกล้อง
          <br />
          ในที่เดียว
        </h1>
      </div>
    </div>
  );
}

/** Camera points of the decoration: [x, y, colour] in the 400×300 art. */
type ArtPoint = readonly [number, number, string];

const SKY = '#7dd3fc';
const AMBER = '#fde68a';
const GREEN = '#86efac';

/**
 * Where the points go so they never sit on the headline: phones anchor the
 * art to the right edge (the text is on the left); wide screens spread it
 * over the whole page with the points in the gap between text and form.
 */
const ART = {
  phone: {
    className: 'md:hidden',
    align: 'xMaxYMin slice',
    road: 'M250 -10C300 60 340 120 330 190s40 90 80 120',
    points: [
      [372, 48, SKY],
      [386, 168, AMBER],
      [352, 262, GREEN],
    ] as ArtPoint[],
    fov: 'M372 48 330 96a62 62 0 0 0 58 10z',
  },
  wide: {
    className: 'hidden md:block',
    align: 'xMidYMid slice',
    road: 'M150 320C170 230 230 190 200 120S180 30 230 -20',
    points: [
      [192, 70, SKY],
      [176, 160, AMBER],
      [210, 238, GREEN],
    ] as ArtPoint[],
    fov: 'M192 70 160 110a52 52 0 0 0 48 4z',
  },
} as const;

/**
 * Decoration only: a faint grid, a dashed road, three camera points with
 * their range and one field of view.
 */
function BrandArt({ variant }: { variant: keyof typeof ART }) {
  const a = ART[variant];
  const grid = `login-grid-${useId().replace(/:/g, '')}`;
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 400 300"
      preserveAspectRatio={a.align}
      className={cx(
        'pointer-events-none absolute inset-0 h-full w-full',
        a.className,
      )}
    >
      <defs>
        <pattern id={grid} width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M32 0H0v32" fill="none" stroke="#fff" strokeOpacity="0.08" />
        </pattern>
      </defs>
      <rect x="-200" width="800" height="300" fill={`url(#${grid})`} />
      <path
        d={a.road}
        fill="none"
        stroke="#fff"
        strokeOpacity="0.2"
        strokeWidth="3"
        strokeDasharray="10 10"
        strokeLinecap="round"
      />
      {/* Field of view of the first camera. */}
      <path d={a.fov} fill="#fff" fillOpacity="0.1" />
      {a.points.map(([x, y, c]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="24" fill={c} fillOpacity="0.14" />
          <circle cx={x} cy={y} r="6" fill={c} stroke="#fff" strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const next = safeNextPath(params.get('next'));
  const me = useMe();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  // Already signed in (e.g. opened /login from a bookmark): go straight on.
  useEffect(() => {
    if (me.data) router.replace(next);
  }, [me.data, next, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const r = validate(loginSchema, { username, password });
    if (r.errors) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await api.auth.login(r.data);
      // Start clean: nothing cached from a previous user may leak into this one.
      qc.clear();
      qc.setQueryData(ME_KEY, res.user);
      router.replace(next);
    } catch (err) {
      setFormError(errorMessage(err));
      setPassword('');
      setBusy(false);
    }
  }

  const notice =
    params.get('expired') === '1'
      ? 'เซสชันหมดอายุหรือถูกยกเลิก กรุณาเข้าสู่ระบบอีกครั้ง'
      : params.get('changed') === '1'
        ? 'เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่'
        : params.get('loggedOut') === '1'
          ? 'ออกจากระบบแล้ว'
          : undefined;
  // An expired session is a heads-up, not a success.
  const expired = params.get('expired') === '1';

  return (
    <form
      onSubmit={submit}
      onFocus={keepInView}
      noValidate
      className="mt-6 space-y-4"
    >
      {notice && !formError && (
        <Banner tone={expired ? 'warn' : 'ok'}>{notice}</Banner>
      )}
      {formError && <Banner tone="error">{formError}</Banner>}
      <Field
        id="username"
        label="ชื่อผู้ใช้"
        icon={<IconUser className="size-5" />}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="next"
        required
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        error={errors.username}
      />
      <Field
        id="password"
        label="รหัสผ่าน"
        icon={<IconLock className="size-5" />}
        type={showPassword ? 'text' : 'password'}
        autoComplete="current-password"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="go"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        end={
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-label={showPassword ? 'ซ่อนรหัส' : 'แสดงรหัส'}
            className="grid size-11 place-items-center rounded-xl text-slate-500 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-slate-400 dark:hover:bg-zinc-800"
          >
            {showPassword ? (
              <IconEyeOff className="size-5" />
            ) : (
              <IconEye className="size-5" />
            )}
          </button>
        }
      />
      <button
        type="submit"
        disabled={busy}
        aria-busy={busy || undefined}
        className="mt-2 flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-base font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {busy && <Spinner />}
        เข้าสู่ระบบ
        {!busy && <IconArrowRight className="size-5" />}
      </button>
    </form>
  );
}

/**
 * Phones: once the keyboard is up, bring the focused field into the visible
 * part of the screen (the form sits at the bottom of the page).
 */
function keepInView(e: FocusEvent<HTMLFormElement>) {
  const el = e.target;
  if (!(el instanceof HTMLInputElement)) return;
  const check = () => {
    const vv = window.visualViewport;
    const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const box = el.getBoundingClientRect();
    if (box.bottom > bottom - 12 || box.top < 0) {
      el.scrollIntoView({ block: 'center' });
    }
  };
  requestAnimationFrame(check);
  // iOS: again once the keyboard has opened.
  window.setTimeout(check, 350);
}

const bannerTones = {
  ok: {
    box: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
    icon: <IconCheck className="size-5" />,
    role: 'status',
  },
  warn: {
    box: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
    icon: <IconClock className="size-5" />,
    role: 'status',
  },
  error: {
    box: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
    icon: <IconAlert className="size-5" />,
    role: 'alert',
  },
} as const;

function Banner({
  tone,
  children,
}: {
  tone: keyof typeof bannerTones;
  children: ReactNode;
}) {
  const t = bannerTones[tone];
  return (
    <div
      role={t.role}
      className={cx(
        'flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm',
        t.box,
      )}
    >
      <span aria-hidden className="mt-px shrink-0">
        {t.icon}
      </span>
      <span>{children}</span>
    </div>
  );
}

/** 52px input with a leading icon and an optional trailing control. */
function Field({
  id,
  label,
  icon,
  end,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  icon: ReactNode;
  end?: ReactNode;
  error?: string;
}) {
  const errorId = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative mt-1.5">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-indigo-500 dark:text-indigo-400"
        >
          {icon}
        </span>
        <input
          id={id}
          name={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cx(
            // 16px text: iOS does not zoom into the field.
            'block h-[52px] w-full rounded-2xl border bg-[#F3F4FB] pl-12 text-base text-zinc-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:bg-zinc-900 dark:focus:ring-indigo-500/25',
            end ? 'pr-14' : 'pr-4',
            error ? 'border-red-500' : 'border-[#E4E6F2] dark:border-zinc-700',
          )}
          {...props}
        />
        {end && (
          <span className="absolute inset-y-0 right-1.5 flex items-center">
            {end}
          </span>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
