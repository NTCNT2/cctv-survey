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
  tall,
  side,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Sticky action row (Save / Cancel); stays reachable above the keyboard. */
  footer?: ReactNode;
  /** Nearly full height on phones (long forms). */
  tall?: boolean;
  /** From `lg`: a panel on the right edge instead of a centred box (map). */
  side?: boolean;
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
      // Only this sheet's own events: React passes close / cancel of a dialog
      // opened inside the sheet (photo preview, confirm) up to here too.
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onClose();
      }}
      // A click on the backdrop targets the <dialog> element itself.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cx(
        // cctv-sheet (globals.css): height fit-content (sized by its
        // content), max-height 92vh, then 92dvh where supported.
        'cctv-sheet m-0 mt-auto min-h-0 w-full max-w-none overflow-hidden rounded-t-3xl border-0 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-zinc-950/40 backdrop:backdrop-blur-[2px]',
        'sm:m-auto sm:max-w-lg sm:rounded-3xl',
        tall && 'cctv-sheet-tall sm:h-auto',
        side &&
          'lg:my-0 lg:ml-auto lg:mr-0 lg:h-dvh lg:max-h-dvh lg:max-w-md lg:rounded-none lg:rounded-l-3xl',
        'dark:bg-zinc-900 dark:text-zinc-100',
        // Plain [open] selector: Tailwind's `open:` variant compiles to
        // :is([open], :popover-open, :open), which older Safari may not match.
        '[&[open]]:flex [&[open]]:flex-col',
      )}
    >
      <div className="flex flex-none justify-center pt-3 sm:hidden" aria-hidden>
        <span className="h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
      </div>
      <header
        data-sheet-header
        className="flex flex-none items-start justify-between gap-3 px-5 pb-2 pt-3 sm:pt-5"
      >
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
      {/*
        Header / scroll area / footer are separate flex children of the sheet,
        whose height is auto (content-sized) up to its max-height.
        - Scroll area: the only scrolling element. flex: 1 1 auto, never
          flex: 1 1 0% — on an iPhone 13 Pro Max (iOS 26.6.2, Safari) a basis-0
          area collapsed to its 20 px padding (scrollHeight 172, clientHeight
          20) and the footer covered the options. min-height: 0 lets it shrink
          and scroll at max-height. No vertical padding on the scroll
          container: spacing is real children (content wrapper + end spacer).
        - Safe area: a spacer element at the end of the footer (or of the
          sheet when there is no footer), never padding of the scroll area.
      */}
      <div
        data-sheet-body
        // scroll-padding (not padding: see above) keeps a field that is scrolled
        // or focused into view clear of a sticky save bar inside the sheet.
        className="min-h-0 flex-auto scroll-pb-24 overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch]"
      >
        <div className="px-5">{children}</div>
        <div aria-hidden data-sheet-scroll-end className="h-5 shrink-0" />
      </div>
      {footer ? (
        <div
          data-sheet-footer
          className="flex flex-none flex-col border-t border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex gap-3 px-5 py-3 [&>*]:flex-1">{footer}</div>
          <SafeAreaSpacer />
        </div>
      ) : (
        <SafeAreaSpacer />
      )}
    </dialog>
  );
}

/** Bottom safe area (home indicator) as a real element, 0 px elsewhere. */
function SafeAreaSpacer() {
  return (
    <div
      aria-hidden
      data-sheet-safe-area
      className="h-[env(safe-area-inset-bottom,0px)] flex-none"
    />
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
  hidden,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Out of sight while a sheet is open; stays mounted so focus can return. */
  hidden?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        hidden && 'invisible',
        'fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-20 inline-flex min-h-14 items-center gap-2 rounded-2xl bg-indigo-600 pl-4 pr-5 text-base font-semibold text-white shadow-lg shadow-indigo-600/30 transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 active:scale-[0.98] md:bottom-8 md:right-8 dark:bg-indigo-500 dark:hover:bg-indigo-400',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Short confirmation ("✓ บันทึก CCTV-001 สำเร็จ"), announced politely to
 * screen readers and hidden after a few seconds.
 */
/**
 * Short message at the top. `tone="error"` (C1): announced at once
 * (role="alert"), red, stays longer and can be closed; everything else is
 * the neutral status style.
 */
export function Toast({
  message,
  onDone,
  tone = 'status',
  ms = tone === 'error' ? 12_000 : 3500,
}: {
  message: string | undefined;
  onDone: () => void;
  tone?: 'status' | 'error';
  ms?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [message, onDone, ms]);
  const error = tone === 'error';
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-50 flex justify-center px-4">
      {message && (
        <div
          role={error ? 'alert' : 'status'}
          aria-live={error ? 'assertive' : 'polite'}
          data-tone={tone}
          className={cx(
            'pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg',
            error
              ? 'bg-red-600 text-white ring-2 ring-red-300 dark:bg-red-500'
              : 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900',
          )}
        >
          <p className="min-w-0 flex-1">{message}</p>
          {error && (
            <button
              type="button"
              onClick={onDone}
              aria-label="ปิดข้อความ"
              className="-m-1 grid size-8 shrink-0 place-items-center rounded-full text-lg leading-none hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  );
}
