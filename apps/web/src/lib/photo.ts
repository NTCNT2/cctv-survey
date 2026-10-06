import { PHOTO_MAX_BYTES, PHOTO_MAX_EDGE, type PhotoType } from '@cctv/shared';

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

/** Shrinks and uploads photos one by one; returns how many failed. */
export async function uploadPhotos(
  items: PhotoUpload[],
  upload: (photo: Blob, meta: Omit<PhotoUpload, 'file'>) => Promise<unknown>,
  onProgress?: (done: number) => void,
): Promise<{ failed: number }> {
  let failed = 0;
  for (let i = 0; i < items.length; i++) {
    const { file, ...meta } = items[i];
    try {
      await upload(await shrinkPhoto(file), meta);
    } catch {
      failed++;
    }
    onProgress?.(i + 1);
  }
  return { failed };
}
