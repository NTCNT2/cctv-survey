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
  /** NT yellow, dark text (never white on yellow). */
  primary:
    'font-bold bg-nt-yellow text-ink shadow-sm hover:bg-nt-yellow-hover disabled:opacity-60',
  /** On white: dark outline, dark text. */
  secondary:
    'font-medium border border-nt-charcoal bg-white text-ink hover:bg-zinc-100 disabled:opacity-50',
  danger:
    'font-medium bg-red-700 text-white hover:bg-red-800 disabled:bg-red-700/50',
  /** Secondary action on the dark header band: grey outline, white text. */
  glass:
    'font-medium border border-nt-gray-outline bg-transparent text-white hover:border-on-dark-muted hover:bg-white/10 focus-visible:outline-nt-yellow disabled:opacity-50',
  /** The main action on the dark header band: yellow, dark text. */
  light:
    'font-bold bg-nt-yellow text-ink shadow-sm hover:bg-nt-yellow-hover focus-visible:outline-nt-yellow disabled:opacity-60',
};

/** 44px minimum height: comfortable tap target on phones. */
const base =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nt-charcoal disabled:cursor-not-allowed';

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
  'mt-1 block w-full min-h-11 rounded-lg border bg-white px-3 text-base text-ink placeholder:text-zinc-400 focus:border-nt-charcoal focus:outline-none focus:ring-4 focus:ring-nt-yellow-soft sm:text-sm';

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
          error ? 'border-red-500' : 'border-zinc-300',
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
        className={cx(inputClass, error ? 'border-red-500' : 'border-zinc-300')}
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
          error ? 'border-red-500' : 'border-zinc-300',
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
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-nt-yellow bg-nt-yellow-soft text-ink',
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
        'rounded-2xl bg-white p-4 text-ink shadow-card sm:p-5',
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
    // On the dark page: white title, light grey subtitle, yellow back link.
    <header className="mb-6 text-on-dark">
      {back && (
        <Link
          href={back.href}
          className="mb-2 inline-flex min-h-11 items-center text-sm font-medium text-nt-yellow hover:underline focus-visible:outline-2 focus-visible:outline-nt-yellow"
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
            <div className="mt-1 text-sm text-on-dark-muted">{subtitle}</div>
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
        <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-200/70" />
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
  /** Shown in a yellow circle above the title. */
  icon?: ReactNode;
}) {
  return (
    // White (it may sit on the dark page as well as inside a card).
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-ink">
      {icon && (
        <span
          aria-hidden
          className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-nt-yellow text-ink"
        >
          {icon}
        </span>
      )}
      <p className="font-medium">{title}</p>
      {detail && <p className="mt-1 text-sm text-zinc-600">{detail}</p>}
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
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-red-800"
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
  /** NT yellow wash, dark text (e.g. the admin role). */
  | 'brand'
  | 'cyan'
  | 'amber'
  | 'orange'
  | 'green'
  | 'red';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-zinc-100 text-zinc-700 ring-zinc-500/20',
  muted: 'bg-zinc-50 text-zinc-500 ring-zinc-400/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  brand: 'bg-nt-yellow-soft text-ink ring-nt-yellow-hover',
  cyan: 'bg-cyan-50 text-cyan-800 ring-cyan-600/25',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  orange: 'bg-orange-50 text-orange-800 ring-orange-600/25',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
};

/** Solid colour per tone: 4px status stripes (project cards, report list). */
export const toneBar: Record<BadgeTone, string> = {
  blue: 'bg-sky-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  brand: 'bg-nt-yellow',
  cyan: 'bg-teal-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  neutral: 'bg-zinc-300',
  muted: 'bg-zinc-300',
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

/**
 * Stat cards are white with a yellow icon circle and a dark number. Only the
 * meaningful states keep a colour of their own: green (done / installed) and
 * red (problems). `featured`: a yellow card (one highlight per page).
 */
const statChips: Partial<Record<BadgeTone, string>> = {
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  /** Drafts and other inactive counts: grey. */
  muted: 'bg-zinc-200 text-zinc-700',
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
  tone,
  unavailable,
  hint,
  wide,
  featured,
  className,
}: {
  label: string;
  value: ReactNode | undefined;
  icon?: ReactNode;
  tone?: BadgeTone;
  unavailable?: boolean;
  hint?: ReactNode;
  wide?: boolean;
  /** Yellow card, dark text, the icon yellow on a dark circle. */
  featured?: boolean;
  className?: string;
}) {
  const number = (
    <dd
      className={cx(
        'text-4xl font-bold tabular-nums tracking-tight',
        !wide && 'mt-2',
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
            className={cx(
              'inline-block h-8 w-12 animate-pulse rounded-lg',
              featured ? 'bg-ink/15' : 'bg-zinc-200/70',
            )}
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
        'grid size-10 shrink-0 place-items-center rounded-full',
        featured
          ? 'bg-nt-charcoal text-nt-yellow'
          : ((tone && statChips[tone]) ?? 'bg-nt-yellow text-ink'),
      )}
    >
      {icon}
    </span>
  );
  const hintEl = hint && (
    <dd
      className={cx('mt-1 text-xs', featured ? 'text-ink' : 'text-ink-muted')}
    >
      {hint}
    </dd>
  );
  const labelEl = (
    <dt className={cx('text-sm', featured ? 'text-ink' : 'text-ink-muted')}>
      {label}
    </dt>
  );
  return (
    <div
      className={cx(
        'flex gap-3 rounded-2xl p-4 text-ink shadow-card sm:p-5',
        featured ? 'bg-nt-yellow' : 'bg-white',
        wide ? 'items-center' : 'items-start justify-between',
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
      className="inline-flex rounded-xl border border-zinc-200 bg-white p-1 shadow-sm"
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
              'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-nt-charcoal',
              size === 'md' && o.iconOnly && 'sm:min-h-9 sm:min-w-9 sm:px-0',
              active
                ? 'bg-nt-yellow font-semibold text-ink'
                : 'text-zinc-500 hover:text-zinc-900',
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
      // On the dark page: white / light grey text, a yellow line under the tab.
      className="flex gap-1 overflow-x-auto border-b border-nt-gray-line"
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
              '-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-nt-yellow',
              active
                ? 'border-nt-yellow font-semibold text-white'
                : 'border-transparent text-on-dark-muted hover:text-white',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="rounded-full bg-white/10 px-2 text-xs tabular-nums text-on-dark-muted">
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
