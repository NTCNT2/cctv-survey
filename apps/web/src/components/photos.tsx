'use client';

import {
  PHOTO_MAX_PER_CAMERA,
  PHOTO_TYPES,
  type CameraPhoto,
  type PhotoType,
} from '@cctv/shared';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { errorMessage } from '@/lib/api';
import { formatDateTime, PHOTO_TYPE_LABELS } from '@/lib/labels';
import { photoFailureMessage } from '@/lib/photo';
import {
  useAddPhotos,
  useDeletePhoto,
  usePhotos,
  useUpdatePhoto,
} from '@/lib/queries';
import { ConfirmButton } from './confirm-button';
import { Alert, Button, SelectField, TextField } from './ui';

const cx = (...c: (string | false | undefined)[]) =>
  c.filter(Boolean).join(' ');

/** Most field photos show where the camera goes; changeable per photo. */
export const DEFAULT_PHOTO_TYPE: PhotoType = 'installation_point';

const TYPE_OPTIONS = [
  ...PHOTO_TYPES.filter((t) => t !== 'other' && t !== 'site'),
  'site' as const,
  'other' as const,
].map((t) => ({ value: t, label: PHOTO_TYPE_LABELS[t] }));

const pickerLook =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold shadow-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-indigo-600';

/**
 * [📷 ถ่ายรูปหน้างาน] opens the camera; [+ เพิ่มรูป] the photo library (several
 * at once; iOS also offers the camera there). Both are <label>s around a
 * hidden file input, so one tap opens the picker (iOS needs a user gesture).
 * accept="image/*": iOS hands over HEIC photos as JPEG.
 */
export function PhotoPickButtons({
  onFiles,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    // Same file twice in a row must fire `change` again.
    e.target.value = '';
    if (files.length > 0) onFiles(files);
  };
  const state = disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer';
  return (
    <div className="grid grid-cols-2 gap-3">
      <label
        className={cx(
          pickerLook,
          state,
          'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500',
        )}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
        <span>ถ่ายรูปหน้างาน</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={disabled}
          onChange={pick}
        />
      </label>
      <label
        className={cx(
          pickerLook,
          state,
          'border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800',
        )}
      >
        <span>+ เพิ่มรูป</span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={disabled}
          onChange={pick}
        />
      </label>
    </div>
  );
}

/** A thumbnail; tapping it opens the photo editor (preview, type, caption). */
function PhotoTile({
  src,
  index,
  type,
  caption,
  onOpen,
  onRemove,
  lazy,
}: {
  src: string;
  index: number;
  /** API thumbnails only: a local preview (blob) must show at once. */
  lazy?: boolean;
  type: PhotoType;
  caption?: string;
  onOpen: () => void;
  /** Quick remove (photos not saved yet). */
  onRemove?: () => void;
}) {
  return (
    <li className="relative">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`ดูรูปที่ ${index + 1}: ${PHOTO_TYPE_LABELS[type]}`}
        className="block w-full overflow-hidden rounded-xl bg-zinc-100 text-left ring-1 ring-zinc-900/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-zinc-800 dark:ring-white/10"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- blob or API URL with session cookie */}
        <img
          src={src}
          alt={`รูปที่ ${index + 1}`}
          loading={lazy ? 'lazy' : 'eager'}
          className="aspect-square w-full object-cover"
        />
        <span className="block truncate px-2 py-1 text-xs font-medium">
          {PHOTO_TYPE_LABELS[type]}
        </span>
        {caption && (
          <span className="-mt-1 block truncate px-2 pb-1 text-[0.7rem] text-zinc-500 dark:text-zinc-400">
            {caption}
          </span>
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          aria-label={`ลบรูปที่ ${index + 1}`}
          onClick={onRemove}
          className="absolute right-1 top-1 grid size-9 place-items-center rounded-full bg-black/60 text-lg leading-none text-white hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-white"
        >
          ×
        </button>
      )}
    </li>
  );
}

interface EditorPhoto {
  src: string;
  type: PhotoType;
  caption?: string;
  /** "date · who" for saved photos. */
  detail?: string;
}

/**
 * Full-screen preview of one photo with its type and an optional caption.
 * Save keeps the dialog's values; delete asks first (`confirmDelete`).
 */
function PhotoEditor({
  photo,
  readOnly,
  confirmDelete,
  onSave,
  onDelete,
  onClose,
}: {
  photo?: EditorPhoto;
  readOnly?: boolean;
  confirmDelete?: boolean;
  onSave: (v: { type: PhotoType; caption: string }) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (photo && !d.open) d.showModal();
    if (!photo && d.open) d.close();
  }, [photo]);
  return (
    <dialog
      ref={ref}
      aria-label="รูปหน้างาน"
      // Not up to a sheet this preview was opened from (see BottomSheet).
      // Only its own events (not the delete confirmation inside it).
      onClose={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onCancel={(e) => {
        e.stopPropagation();
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-white backdrop:bg-black"
    >
      {photo && (
        // Keyed by photo: the fields start from that photo's values.
        <EditorBody
          key={photo.src}
          photo={photo}
          readOnly={readOnly}
          confirmDelete={confirmDelete}
          onSave={onSave}
          onDelete={onDelete}
          onClose={onClose}
        />
      )}
    </dialog>
  );
}

function EditorBody({
  photo,
  readOnly,
  confirmDelete,
  onSave,
  onDelete,
  onClose,
}: {
  photo: EditorPhoto;
  readOnly?: boolean;
  confirmDelete?: boolean;
  onSave: (v: { type: PhotoType; caption: string }) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [type, setType] = useState<PhotoType>(photo.type);
  const [caption, setCaption] = useState(photo.caption ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      await onSave({ type, caption: caption.trim() });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between gap-2 p-3">
        <p className="min-w-0 truncate text-xs text-zinc-300">
          {photo.detail ?? 'ยังไม่ได้อัปโหลด — อัปโหลดเมื่อบันทึกกล้อง'}
        </p>
        <Button variant="secondary" onClick={onClose}>
          ปิด
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center px-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- blob or API URL with session cookie */}
        <img
          src={photo.src}
          alt="รูปหน้างาน"
          className="max-h-full max-w-full object-contain"
        />
      </div>
      <div className="space-y-3 bg-zinc-950 p-3 text-zinc-100 [&_label]:text-zinc-200">
        {error && <Alert>{error}</Alert>}
        {readOnly ? (
          <p className="text-sm">
            {PHOTO_TYPE_LABELS[photo.type]}
            {photo.caption && ` · ${photo.caption}`}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                id="photo-type"
                label="ประเภทรูป"
                value={type}
                onChange={(e) => setType(e.target.value as PhotoType)}
                options={TYPE_OPTIONS}
              />
              <TextField
                id="photo-caption"
                label="คำอธิบาย (ไม่บังคับ)"
                maxLength={500}
                autoComplete="off"
                enterKeyHint="done"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {confirmDelete ? (
                <ConfirmButton
                  label="ลบรูปนี้"
                  title="ลบรูปนี้?"
                  detail="ลบแล้วกู้คืนไม่ได้"
                  onConfirm={async () => {
                    await onDelete();
                  }}
                />
              ) : (
                <Button variant="danger" onClick={() => void onDelete()}>
                  ลบรูปนี้
                </Button>
              )}
              <Button onClick={save} busy={busy}>
                บันทึกรูป
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New camera: photos chosen before the point exists
// ---------------------------------------------------------------------------

/** A photo chosen in the form, with its local preview URL. */
export interface PendingPhoto {
  file: File;
  url: string;
  type: PhotoType;
  caption: string;
}

/**
 * Photos of a new point: previews with type and caption, uploaded right after
 * the point is saved. Optional.
 */
export function PendingPhotos({
  photos,
  onChange,
}: {
  photos: PendingPhoto[];
  onChange: (photos: PendingPhoto[]) => void;
}) {
  // Preview URLs are freed when a photo is removed and when the form closes.
  const latest = useRef(photos);
  useEffect(() => {
    latest.current = photos;
  }, [photos]);
  useEffect(
    () => () => latest.current.forEach((p) => URL.revokeObjectURL(p.url)),
    [],
  );
  const [open, setOpen] = useState<number>();

  function add(files: File[]) {
    const room = PHOTO_MAX_PER_CAMERA - photos.length;
    const more = files.slice(0, Math.max(0, room)).map((file) => ({
      file,
      url: URL.createObjectURL(file),
      type: DEFAULT_PHOTO_TYPE,
      caption: '',
    }));
    onChange([...photos, ...more]);
  }

  function remove(i: number) {
    URL.revokeObjectURL(photos[i].url);
    onChange(photos.filter((_, j) => j !== i));
    setOpen(undefined);
  }

  const current = open === undefined ? undefined : photos[open];
  return (
    <div className="space-y-3">
      <PhotoPickButtons
        onFiles={add}
        disabled={photos.length >= PHOTO_MAX_PER_CAMERA}
      />
      {photos.length > 0 && (
        <ul
          aria-label="รูปที่จะบันทึก"
          className="grid grid-cols-3 gap-2 sm:grid-cols-4"
        >
          {photos.map((p, i) => (
            <PhotoTile
              key={p.url}
              src={p.url}
              index={i}
              type={p.type}
              caption={p.caption}
              onOpen={() => setOpen(i)}
              onRemove={() => remove(i)}
            />
          ))}
        </ul>
      )}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        ไม่บังคับ · แตะรูปเพื่อดูภาพใหญ่ เลือกประเภทรูป หรือใส่คำอธิบาย
      </p>
      <PhotoEditor
        photo={
          current && {
            src: current.url,
            type: current.type,
            caption: current.caption,
          }
        }
        onClose={() => setOpen(undefined)}
        onDelete={() => {
          if (open !== undefined) remove(open);
        }}
        onSave={({ type, caption }) => {
          if (open === undefined) return;
          onChange(
            photos.map((p, j) => (j === open ? { ...p, type, caption } : p)),
          );
          setOpen(undefined);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saved camera: photos through the Photo API
// ---------------------------------------------------------------------------

/**
 * Upload state shared by the photo section and a "เพิ่มรูป" button.
 * `onDone`: after each batch (the camera page clears an older failure).
 */
export function usePhotoUpload(
  cameraId: string,
  projectId: string,
  onDone?: (r: { uploaded: number; failed: number }) => void,
) {
  const photos = usePhotos(cameraId);
  const add = useAddPhotos(cameraId, projectId);
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  const [message, setMessage] = useState<string>();
  const count = photos.data?.length ?? 0;

  async function upload(files: File[]) {
    const batch = files.slice(0, Math.max(0, PHOTO_MAX_PER_CAMERA - count));
    if (batch.length === 0) return;
    setMessage(undefined);
    setProgress({ done: 0, total: batch.length });
    try {
      const r = await add.mutateAsync({
        items: batch.map((file) => ({ file, type: DEFAULT_PHOTO_TYPE })),
        onProgress: (done) => setProgress({ done, total: batch.length }),
      });
      // C2: the real cause of each failure, never one generic text.
      setMessage(
        r.failures.length > 0
          ? photoFailureMessage(r.failures, batch.length)
          : undefined,
      );
      onDone?.(r);
    } catch (err) {
      setMessage(`อัปโหลดรูปไม่สำเร็จ: ${errorMessage(err)}`);
    } finally {
      setProgress(undefined);
    }
  }

  return {
    photos,
    upload,
    progress,
    message,
    full: count >= PHOTO_MAX_PER_CAMERA,
  };
}

/** One "เพิ่มรูป" button: iOS / Android offer camera or library themselves. */
export function AddPhotoButton({
  uploader,
}: {
  uploader: ReturnType<typeof usePhotoUpload>;
}) {
  const disabled = !!uploader.progress || uploader.full;
  return (
    <label
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100',
        disabled
          ? 'pointer-events-none opacity-50'
          : 'cursor-pointer hover:bg-zinc-50 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-indigo-600 dark:hover:bg-zinc-800',
      )}
    >
      เพิ่มรูป
      <input
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length > 0) void uploader.upload(files);
        }}
      />
    </label>
  );
}

/**
 * Saved photos of a point: thumbnails with their type; tapping one opens the
 * preview where its type / caption can be changed (PATCH) or it can be
 * deleted. `withButtons`: the camera / library buttons above the grid (form).
 */
export function SavedPhotos({
  cameraId,
  projectId,
  canWrite,
  uploader,
  withButtons,
  heading = true,
}: {
  cameraId: string;
  projectId: string;
  canWrite: boolean;
  uploader: ReturnType<typeof usePhotoUpload>;
  withButtons?: boolean;
  heading?: boolean;
}) {
  const { photos, progress, message } = uploader;
  const update = useUpdatePhoto(cameraId, projectId);
  const del = useDeletePhoto(cameraId, projectId);
  const [viewing, setViewing] = useState<CameraPhoto>();
  const list = photos.data ?? [];

  return (
    <section aria-label="รูปหน้างาน" className="space-y-3">
      {heading && (
        <h3 className="text-sm font-semibold">
          รูปหน้างาน ({photos.isPending ? '…' : list.length})
        </h3>
      )}
      {canWrite && withButtons && (
        <PhotoPickButtons
          onFiles={(files) => void uploader.upload(files)}
          disabled={!!progress || uploader.full}
        />
      )}
      {photos.isError && <Alert>{errorMessage(photos.error)}</Alert>}
      {message && <Alert>{message}</Alert>}
      {progress && (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          กำลังอัปโหลด {progress.done}/{progress.total} …
        </p>
      )}
      {list.length > 0 && (
        <ul
          aria-label="รูปหน้างานที่บันทึกแล้ว"
          className="grid grid-cols-3 gap-2 sm:grid-cols-4"
        >
          {list.map((p, i) => (
            <PhotoTile
              key={p.id}
              src={p.thumbUrl}
              lazy
              index={i}
              type={p.photoType}
              caption={p.caption}
              onOpen={() => setViewing(p)}
            />
          ))}
        </ul>
      )}
      {!photos.isPending && list.length === 0 && (
        <p className="text-sm text-zinc-500">ยังไม่มีรูป</p>
      )}
      <PhotoEditor
        photo={
          viewing && {
            src: viewing.url,
            type: viewing.photoType,
            caption: viewing.caption,
            detail: [formatDateTime(viewing.createdAt), viewing.createdByName]
              .filter(Boolean)
              .join(' · '),
          }
        }
        readOnly={!canWrite}
        confirmDelete
        onClose={() => setViewing(undefined)}
        onDelete={async () => {
          if (!viewing) return;
          await del.mutateAsync(viewing.id);
          setViewing(undefined);
        }}
        onSave={async ({ type, caption }) => {
          if (!viewing) return;
          // Only what changed; nothing changed → no request.
          const body = {
            ...(type !== viewing.photoType && { photoType: type }),
            ...(caption !== (viewing.caption ?? '') && {
              caption: caption || null,
            }),
          };
          if (Object.keys(body).length > 0) {
            await update.mutateAsync({ id: viewing.id, body });
          }
          setViewing(undefined);
        }}
      />
    </section>
  );
}
