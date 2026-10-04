'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

const cx = (...c: (string | false | undefined)[]) =>
  c.filter(Boolean).join(' ');

/**
 * Bottom sheet on phones, centred panel from `sm` up. Built on the native
 * modal <dialog>: the rest of the page is inert, focus stays inside, Escape
 * closes it and focus returns to the control that opened it.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Sticky action row (Save / Cancel); stays reachable above the keyboard. */
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      // Escape (and the close button) end in the "close" event: keep React state in sync.
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click on the backdrop targets the <dialog> element itself.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cx(
        'm-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl border-0 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-zinc-950/40 backdrop:backdrop-blur-[2px]',
        'sm:m-auto sm:max-w-lg sm:rounded-3xl',
        'dark:bg-zinc-900 dark:text-zinc-100',
        'open:flex open:flex-col',
      )}
    >
      <div className="flex justify-center pt-3 sm:hidden" aria-hidden>
        <span className="h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
      </div>
      <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-3 sm:pt-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {description && (
            <p
              id={descId}
              className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400"
            >
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="size-5"
            aria-hidden
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
        {children}
      </div>
      {footer && (
        <div className="flex gap-3 border-t border-zinc-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-zinc-800 dark:bg-zinc-900 [&>*]:flex-1">
          {footer}
        </div>
      )}
    </dialog>
  );
}

/**
 * A large choice row inside a sheet ("ใช้ตำแหน่งปัจจุบัน", "เลือกบนแผนที่").
 * 64px high so it is easy to hit while walking.
 */
export function SheetOption({
  icon,
  title,
  detail,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-16 w-full items-center gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-indigo-500/60 dark:hover:bg-indigo-500/10"
    >
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        {detail && (
          <span className="block text-sm text-zinc-500 dark:text-zinc-400">
            {detail}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * Floating action button for the one main action of a screen ("+ เพิ่มจุด").
 * Sits above the phone bottom navigation and the home indicator.
 */
export function Fab({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-20 inline-flex min-h-14 items-center gap-2 rounded-2xl bg-indigo-600 pl-4 pr-5 text-base font-semibold text-white shadow-lg shadow-indigo-600/30 transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 active:scale-[0.98] md:bottom-8 md:right-8 dark:bg-indigo-500 dark:hover:bg-indigo-400"
    >
      {icon}
      {label}
    </button>
  );
}
