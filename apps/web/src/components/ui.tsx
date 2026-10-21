import Link from 'next/link';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

const cx = (...c: (string | false | undefined)[]) =>
  c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'danger' | 'glass' | 'light';

const variants: Record<Variant, string> = {
  primary:
    'font-medium bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 disabled:bg-indigo-600/50 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:disabled:bg-indigo-500/50',
  secondary:
    'font-medium border border-zinc-200 bg-white text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800',
  danger:
    'font-medium bg-red-700 text-white hover:bg-red-800 disabled:bg-red-700/50 dark:bg-red-600 dark:hover:bg-red-500',
  /** On a coloured band (dashboard header): translucent white. */
  glass:
    // 12% (not 15%): white text stays >= 4.5:1 at the band's violet end.
    'font-medium border border-white/30 bg-white/12 text-white hover:border-white/60 focus-visible:outline-white disabled:opacity-50',
  /** The main action on a coloured band: white, indigo text. */
  light:
    'font-semibold bg-white text-indigo-700 shadow-sm hover:bg-indigo-50 focus-visible:outline-white disabled:opacity-50',
};

/** 44px minimum height: comfortable tap target on phones. */
const base =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:focus-visible:outline-indigo-400 disabled:cursor-not-allowed';

export function Button({
  variant = 'primary',
  busy,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  busy?: boolean;
}) {
  return (
    <button
      className={cx(base, variants[variant], className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = 'primary',
  className,
  children,
  ...props
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
}) {
  return (
    <Link
      href={href}
      className={cx(base, variants[variant], className)}
      {...props}
    >
      {children}
    </Link>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

const inputClass =
  'mt-1 block w-full min-h-11 rounded-lg border bg-white px-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-2 focus:outline-indigo-600 dark:focus:outline-indigo-400 dark:bg-zinc-900 dark:text-zinc-100 sm:text-sm';

function FieldShell({
  id,
  label,
  error,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required && (
          <span className="text-red-600" aria-hidden>
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-zinc-500">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 text-sm text-red-600"
        >
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export function TextField({
  id,
  label,
  error,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}) {
  return (
    <FieldShell
      id={id}
      label={label}
      error={error}
      hint={hint}
      required={props.required}
    >
      <input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cx(
          inputClass,
          error ? 'border-red-500' : 'border-zinc-300 dark:border-zinc-700',
          className,
        )}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  id,
  label,
  error,
  hint,
  options,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <FieldShell
      id={id}
      label={label}
      error={error}
      hint={hint}
      required={props.required}
    >
      <select
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cx(
          inputClass,
          error ? 'border-red-500' : 'border-zinc-300 dark:border-zinc-700',
        )}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function TextAreaField({
  id,
  label,
  error,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string;
  label: string;
  error?: string;
}) {
  return (
    <FieldShell id={id} label={label} error={error}>
      <textarea
        id={id}
        name={id}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error)}
        className={cx(
          inputClass,
          'py-2',
          error ? 'border-red-500' : 'border-zinc-300 dark:border-zinc-700',
        )}
        {...props}
      />
    </FieldShell>
  );
}

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'info';
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-lg border px-4 py-3 text-sm',
        tone === 'error'
          ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
          : 'border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-100',
      )}
    >
      {children}
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {back && (
        <Link
          href={back.href}
          className="mb-2 inline-flex min-h-11 items-center text-sm text-indigo-700 hover:underline dark:text-indigo-400"
        >
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-xl font-semibold tracking-tight sm:text-2xl">
            {title}
          </h1>
          {subtitle && (
            <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {subtitle}
            </div>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-busy="true" aria-label="กำลังโหลด" className="space-y-3">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-zinc-800"
        />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  action,
  icon,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
  /** Shown in an indigo circle above the title. */
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center dark:border-zinc-700">
      {icon && (
        <span
          aria-hidden
          className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
        >
          {icon}
        </span>
      )}
      <p className="font-medium">{title}</p>
      {detail && (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {detail}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      <p>{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          ลองใหม่
        </Button>
      )}
    </div>
  );
}

/** Shown when the role may not use a page. The API refuses the action anyway. */
export function Forbidden() {
  return (
    <ErrorState message="คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (สิทธิ์ของบัญชีนี้ดูข้อมูลได้เท่านั้น หรือไม่ได้รับอนุญาตให้ทำรายการนี้)" />
  );
}

export type BadgeTone =
  | 'neutral'
  | 'muted'
  | 'blue'
  | 'violet'
  | 'cyan'
  | 'amber'
  | 'orange'
  | 'green'
  | 'red';

const badgeTones: Record<BadgeTone, string> = {
  neutral:
    'bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-400/20',
  muted:
    'bg-zinc-50 text-zinc-500 ring-zinc-400/20 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-500/25',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-400/25',
  violet:
    'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-400/25',
  cyan: 'bg-cyan-50 text-cyan-800 ring-cyan-600/25 dark:bg-cyan-950 dark:text-cyan-300 dark:ring-cyan-400/25',
  amber:
    'bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/25',
  orange:
    'bg-orange-50 text-orange-800 ring-orange-600/25 dark:bg-orange-950 dark:text-orange-300 dark:ring-orange-400/25',
  green:
    'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/25',
  red: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950 dark:text-red-300 dark:ring-red-400/25',
};

export function Badge({
  tone = 'neutral',
  dot,
  children,
}: {
  tone?: BadgeTone;
  /** A small coloured dot before the text (status badges). */
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        badgeTones[tone],
      )}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function DefinitionList({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs text-zinc-500">{i.label}</dt>
          <dd className="break-words text-sm">{i.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Dashboard / navigation building blocks (design system, Phase 1)
// ---------------------------------------------------------------------------

const statAccents: Record<BadgeTone, string> = {
  neutral: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  muted: 'bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400',
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
  violet:
    'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
  cyan: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  orange:
    'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300',
  green:
    'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  red: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
};

/**
 * Tinted card per tone: a pale wash of the hue, a matching border, the icon on
 * the hue's 200 step, icon and number in its 700 step (>= 4.5:1 on the wash).
 * Neutral / muted stay white. Dark mode mixes the hue into the card colour:
 * opaque, so nothing behind a card (the dashboard header band) shows through.
 */
const statSurfaces: Record<
  BadgeTone,
  { card: string; value: string; chip?: string }
> = {
  neutral: {
    card: 'border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900',
    value: '',
  },
  muted: {
    card: 'border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-900',
    value: '',
  },
  blue: {
    card: 'border-sky-100 bg-sky-50 dark:border-sky-400/20 dark:bg-[color-mix(in_oklab,var(--color-sky-500)_12%,var(--card))]',
    value: 'text-sky-700 dark:text-sky-300',
    chip: 'bg-sky-200 text-sky-700 dark:bg-sky-400/20 dark:text-sky-300',
  },
  violet: {
    card: 'border-violet-100 bg-violet-50 dark:border-violet-400/20 dark:bg-[color-mix(in_oklab,var(--color-violet-500)_12%,var(--card))]',
    value: 'text-violet-700 dark:text-violet-300',
    chip: 'bg-violet-200 text-violet-700 dark:bg-violet-400/20 dark:text-violet-300',
  },
  cyan: {
    card: 'border-teal-100 bg-teal-50 dark:border-teal-400/20 dark:bg-[color-mix(in_oklab,var(--color-teal-500)_12%,var(--card))]',
    value: 'text-teal-700 dark:text-teal-300',
    chip: 'bg-teal-200 text-teal-700 dark:bg-teal-400/20 dark:text-teal-300',
  },
  amber: {
    card: 'border-amber-100 bg-amber-50 dark:border-amber-400/20 dark:bg-[color-mix(in_oklab,var(--color-amber-500)_12%,var(--card))]',
    value: 'text-amber-700 dark:text-amber-300',
    chip: 'bg-amber-200 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300',
  },
  orange: {
    card: 'border-orange-100 bg-orange-50 dark:border-orange-400/20 dark:bg-[color-mix(in_oklab,var(--color-orange-500)_12%,var(--card))]',
    value: 'text-orange-700 dark:text-orange-300',
    chip: 'bg-orange-200 text-orange-700 dark:bg-orange-400/20 dark:text-orange-300',
  },
  green: {
    card: 'border-emerald-100 bg-emerald-50 dark:border-emerald-400/20 dark:bg-[color-mix(in_oklab,var(--color-emerald-500)_12%,var(--card))]',
    value: 'text-emerald-700 dark:text-emerald-300',
    chip: 'bg-emerald-200 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300',
  },
  red: {
    card: 'border-red-100 bg-red-50 dark:border-red-400/20 dark:bg-[color-mix(in_oklab,var(--color-red-500)_12%,var(--card))]',
    value: 'text-red-700 dark:text-red-300',
    chip: 'bg-red-200 text-red-700 dark:bg-red-400/20 dark:text-red-300',
  },
};

/**
 * A number with a label, for summary rows. Render inside a <dl>. `value`
 * undefined shows a placeholder (loading) or "—" (`unavailable`). `wide`:
 * one horizontal row — icon, label and hint, then the number on the right.
 */
export function StatCard({
  label,
  value,
  icon,
  tone = 'neutral',
  unavailable,
  hint,
  wide,
  raised,
  className,
}: {
  label: string;
  value: ReactNode | undefined;
  icon?: ReactNode;
  tone?: BadgeTone;
  unavailable?: boolean;
  hint?: ReactNode;
  wide?: boolean;
  /** Soft indigo shadow (a row over a coloured band); 'lg': from lg only. */
  raised?: boolean | 'lg';
  className?: string;
}) {
  const surface = statSurfaces[tone];
  const number = (
    <dd
      className={cx(
        'text-4xl font-bold tabular-nums tracking-tight',
        !wide && 'mt-2',
        surface.value,
      )}
    >
      {value !== undefined ? (
        value
      ) : unavailable ? (
        <span title="โหลดข้อมูลไม่สำเร็จ">—</span>
      ) : (
        <>
          <span
            aria-hidden
            className="inline-block h-8 w-12 animate-pulse rounded-lg bg-zinc-200/70 dark:bg-zinc-800"
          />
          <span className="sr-only">รอข้อมูล</span>
        </>
      )}
    </dd>
  );
  const chip = icon && (
    <span
      aria-hidden
      className={cx(
        'grid size-10 shrink-0 place-items-center rounded-xl',
        surface.chip ?? statAccents[tone],
      )}
    >
      {icon}
    </span>
  );
  const hintEl = hint && (
    // slate-600: slate-500 is under 4.5:1 on the violet and sky washes.
    <dd className="mt-1 text-xs text-slate-600 dark:text-slate-400">{hint}</dd>
  );
  const labelEl = (
    <dt className="text-sm text-slate-600 dark:text-slate-400">{label}</dt>
  );
  return (
    <div
      className={cx(
        'flex gap-3 rounded-2xl border p-4 sm:p-5',
        raised === true
          ? 'shadow-[0_4px_14px_rgba(79,70,229,0.10)]'
          : raised === 'lg'
            ? 'shadow-sm lg:shadow-[0_4px_14px_rgba(79,70,229,0.10)]'
            : 'shadow-sm',
        wide ? 'items-center' : 'items-start justify-between',
        surface.card,
        className,
      )}
    >
      {wide ? (
        <>
          {chip}
          <div className="min-w-0 flex-1">
            {labelEl}
            {hintEl}
          </div>
          {number}
        </>
      ) : (
        <>
          <div className="min-w-0">
            {labelEl}
            {number}
            {hintEl}
          </div>
          {chip}
        </>
      )}
    </div>
  );
}

/**
 * Mutually exclusive options shown as one control (view switch, map layers).
 * Buttons with aria-pressed; give icon-only options a `label`.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
  size = 'md',
}: {
  /** Accessible name of the group. */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: ReactNode; iconOnly?: boolean }[];
  size?: 'md' | 'lg';
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-xl border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            aria-label={o.iconOnly ? o.label : undefined}
            title={o.iconOnly ? o.label : undefined}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-indigo-600',
              size === 'md' && o.iconOnly && 'sm:min-h-9 sm:min-w-9 sm:px-0',
              active
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
            )}
          >
            {o.icon}
            {!o.iconOnly && o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Tab list (role="tablist") with arrow-key navigation. The caller renders the
 * panel; pass `panelId` so the tabs point at it.
 */
export function Tabs<T extends string>({
  label,
  value,
  onChange,
  tabs,
  panelId,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  tabs: { value: T; label: string; count?: number }[];
  panelId: string;
}) {
  const move = (from: number, step: number) => {
    const next = tabs[(from + step + tabs.length) % tabs.length];
    onChange(next.value);
    document.getElementById(`${panelId}-tab-${next.value}`)?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800"
    >
      {tabs.map((t, i) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            id={`${panelId}-tab-${t.value}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') move(i, 1);
              if (e.key === 'ArrowLeft') move(i, -1);
            }}
            className={cx(
              '-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600',
              active
                ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="rounded-full bg-zinc-100 px-2 text-xs tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
