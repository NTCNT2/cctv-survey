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

type Variant = 'primary' | 'secondary' | 'danger';

const variants: Record<Variant, string> = {
  primary:
    'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 disabled:bg-indigo-600/50 dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:disabled:bg-indigo-500/50',
  secondary:
    'border border-zinc-200 bg-white text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800',
  danger:
    'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-700/50 dark:bg-red-600 dark:hover:bg-red-500',
};

/** 44px minimum height: comfortable tap target on phones. */
const base =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:focus-visible:outline-indigo-400 disabled:cursor-not-allowed';

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
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center dark:border-zinc-700">
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
  'neutral' | 'muted' | 'blue' | 'violet' | 'cyan' | 'amber' | 'green';

const badgeTones: Record<BadgeTone, string> = {
  neutral:
    'bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-400/20',
  muted:
    'bg-zinc-50 text-zinc-500 ring-zinc-400/20 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-500/25',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-400/25',
  violet:
    'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-400/25',
  cyan: 'bg-cyan-50 text-cyan-800 ring-cyan-600/25 dark:bg-cyan-950 dark:text-cyan-300 dark:ring-cyan-400/25',
  amber:
    'bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/25',
  green:
    'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/25',
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
