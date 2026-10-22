'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { errorMessage } from '@/lib/api';
import { Alert, Button } from './ui';

/**
 * A button that asks for confirmation in a modal <dialog> before running a
 * destructive action. Errors (e.g. 409 "still has children") are shown inside
 * the dialog so the user sees why nothing happened.
 */
export function ConfirmButton({
  label,
  title,
  detail,
  confirmLabel = 'ยืนยันการลบ',
  variant = 'danger',
  ariaLabel,
  onConfirm,
}: {
  label: ReactNode;
  title: string;
  detail?: string;
  confirmLabel?: string;
  /** The opening button; the confirm button stays red. */
  variant?: 'danger' | 'secondary';
  ariaLabel?: string;
  onConfirm: () => Promise<unknown>;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const open = () => {
    setError(undefined);
    dialog.current?.showModal();
  };
  const confirm = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm();
      dialog.current?.close();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant={variant} onClick={open} aria-label={ariaLabel}>
        {label}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl bg-white p-5 text-zinc-900 shadow-xl backdrop:bg-black/40"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {detail && <p className="mt-2 text-sm text-zinc-600">{detail}</p>}
        {error && (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            onClick={() => dialog.current?.close()}
            disabled={busy}
          >
            ยกเลิก
          </Button>
          <Button variant="danger" onClick={confirm} busy={busy}>
            {confirmLabel}
          </Button>
        </div>
      </dialog>
    </>
  );
}
