import { PHOTO_MAX_BYTES, PHOTO_MAX_EDGE, type PhotoType } from '@cctv/shared';
import { ApiError } from './api';

/**
 * Field photos from a phone camera are 3–12 MB; the proxy accepts request
 * bodies up to 1 MB. Each photo is redrawn as a JPEG of at most
 * PHOTO_MAX_EDGE px on its long side, lowering quality (then size) until it
 * fits PHOTO_MAX_BYTES. The server decodes and re-encodes it again anyway.
 */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  const img = await decode(file);
  try {
    let edge = Math.min(PHOTO_MAX_EDGE, Math.max(img.width, img.height));
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = edge / Math.max(img.width, img.height);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas unavailable');
      ctx.drawImage(img.source, 0, 0, w, h);
      for (const quality of [0.85, 0.75, 0.65]) {
        const blob = await toJpeg(canvas, quality);
        if (blob.size <= PHOTO_MAX_BYTES) return blob;
      }
      edge = Math.round(edge * 0.75);
    }
  } finally {
    img.close();
  }
  throw new Error('photo too large');
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

/** Applies the EXIF orientation, so portrait photos stay upright. */
async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
      return {
        source: bmp,
        width: bmp.width,
        height: bmp.height,
        close: () => bmp.close(),
      };
    } catch {
      // Older Safari: fall back to <img>, which also honours EXIF orientation.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => undefined,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('encode failed'))),
      'image/jpeg',
      quality,
    ),
  );
}

/** A photo to upload, with what it shows and an optional caption. */
export interface PhotoUpload {
  file: Blob;
  type: PhotoType;
  caption?: string;
}

/** Why one photo could not be uploaded (C2: shown to the user as it is). */
export type PhotoFailReason =
  | 'too_large' // 413, or still too big after shrinking
  | 'unsupported' // 415, 400 "not a valid image", or the browser cannot decode it
  | 'unauthorized' // 401: the session ended
  | 'forbidden' // 403
  | 'limit' // 409: the point already has the maximum number of photos
  | 'network' // no answer from the server
  | 'server' // 5xx
  | 'other';

export interface PhotoFailure {
  /** Position in the batch (0-based) and the file name, if any. */
  index: number;
  name?: string;
  reason: PhotoFailReason;
  /** HTTP status when the server answered. */
  status?: number;
}

/** Thai text per reason; never one generic text for every error. */
export const PHOTO_FAIL_TEXT: Record<PhotoFailReason, string> = {
  too_large: 'ไฟล์ใหญ่เกินไป',
  unsupported: 'ไม่รองรับชนิดไฟล์',
  unauthorized: 'กรุณาเข้าสู่ระบบใหม่',
  forbidden: 'ไม่มีสิทธิ์เพิ่มรูป',
  limit: 'รูปครบจำนวนสูงสุดของจุดนี้แล้ว',
  network: 'เชื่อมต่อ Server ไม่สำเร็จ',
  server: 'Server มีปัญหา',
  other: 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ',
};

/** Thrown by shrinkPhoto / decode; anything else is classified by status. */
export function photoFailReason(err: unknown): {
  reason: PhotoFailReason;
  status?: number;
} {
  if (err instanceof ApiError) {
    const status = err.status;
    if (status === 0) return { reason: 'network' };
    if (status === 413) return { reason: 'too_large', status };
    if (status === 415 || status === 400)
      return { reason: 'unsupported', status };
    if (status === 401) return { reason: 'unauthorized', status };
    if (status === 403) return { reason: 'forbidden', status };
    if (status === 409) return { reason: 'limit', status };
    if (status >= 500) return { reason: 'server', status };
    return { reason: 'other', status };
  }
  if (err instanceof Error && err.message === 'photo too large') {
    return { reason: 'too_large' };
  }
  // The browser could not read the file (e.g. HEIC outside Safari).
  return { reason: 'unsupported' };
}

/**
 * "อัปโหลดรูปไม่สำเร็จ 2 จาก 3 รูป: ไฟล์ใหญ่เกินไป, Server มีปัญหา (500)".
 * Always starts with "อัปโหลดรูปไม่สำเร็จ"; each distinct cause once.
 */
export function photoFailureMessage(
  failures: PhotoFailure[],
  total: number,
): string {
  const causes = [
    ...new Set(
      failures.map(
        (f) =>
          PHOTO_FAIL_TEXT[f.reason] +
          (f.reason === 'server' && f.status ? ` (${f.status})` : ''),
      ),
    ),
  ];
  return `อัปโหลดรูปไม่สำเร็จ ${failures.length} จาก ${total} รูป: ${causes.join(', ')}`;
}

/**
 * Shrinks and uploads photos one by one. Never throws: each photo that
 * fails is reported with its reason, the others are still uploaded.
 * `shrink` is replaceable for tests.
 */
export async function uploadPhotos(
  items: PhotoUpload[],
  upload: (photo: Blob, meta: Omit<PhotoUpload, 'file'>) => Promise<unknown>,
  onProgress?: (done: number) => void,
  shrink: (file: Blob) => Promise<Blob> = shrinkPhoto,
): Promise<{ uploaded: number; failed: number; failures: PhotoFailure[] }> {
  const failures: PhotoFailure[] = [];
  for (let i = 0; i < items.length; i++) {
    const { file, ...meta } = items[i];
    try {
      await upload(await shrink(file), meta);
    } catch (err) {
      failures.push({
        index: i,
        name: file instanceof File ? file.name : undefined,
        ...photoFailReason(err),
      });
    }
    onProgress?.(i + 1);
  }
  return {
    uploaded: items.length - failures.length,
    failed: failures.length,
    failures,
  };
}

/** Failures in a URL parameter: "server.500,too_large" (camera page alert). */
export function encodePhotoFailures(failures: PhotoFailure[]): string {
  return failures
    .map((f) => (f.status ? `${f.reason}.${f.status}` : f.reason))
    .join(',');
}
export function decodePhotoFailures(v: string | null): PhotoFailure[] {
  if (!v) return [];
  return v.split(',').flatMap((part, index) => {
    const [reason, status] = part.split('.');
    if (!(reason in PHOTO_FAIL_TEXT)) return [];
    return [
      {
        index,
        reason: reason as PhotoFailReason,
        status: status ? Number(status) : undefined,
      },
    ];
  });
}
