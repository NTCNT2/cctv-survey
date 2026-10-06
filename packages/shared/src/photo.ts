import { z } from 'zod';

/**
 * Field photos of a camera point (0005, 0006). Uploaded one at a time as a raw
 * image body (not JSON, not multipart) to POST /cameras/:id/photos; type and
 * caption as query parameters there, or later with PATCH.
 */

/** What a photo shows (0006). */
export const PHOTO_TYPES = [
  'site',
  'installation_point',
  'pole_structure',
  'cabinet_equipment',
  'cable_route',
  'other',
] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

const caption = z.string().trim().max(500);

/** Query of POST /cameras/:id/photos (the body is the image itself). */
export const uploadPhotoQuerySchema = z.object({
  type: z.enum(PHOTO_TYPES).default('other'),
  caption: caption.optional(),
});
export type UploadPhotoQuery = z.infer<typeof uploadPhotoQuerySchema>;

/** PATCH /cameras/:id/photos/:photoId — `null` clears the caption. */
export const updatePhotoSchema = z
  .object({ photoType: z.enum(PHOTO_TYPES), caption: caption.nullable() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'at least one field is required');
export type UpdatePhotoInput = z.infer<typeof updatePhotoSchema>;

/** GET …/file?size=thumb for the thumbnail; the photo itself otherwise. */
export const photoFileQuerySchema = z.object({
  size: z.enum(['original', 'thumb']).default('original'),
});

/** Image types accepted for upload; the server re-encodes every one to JPEG. */
export const PHOTO_UPLOAD_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type PhotoUploadType = (typeof PHOTO_UPLOAD_TYPES)[number];

/**
 * Largest upload. The proxy (Caddy) accepts request bodies up to 1 MB; the web
 * app shrinks photos below this before sending them.
 */
export const PHOTO_MAX_BYTES = 950 * 1024;

/** Longest side of a stored photo / its thumbnail, in pixels. */
export const PHOTO_MAX_EDGE = 1920;
export const PHOTO_THUMB_EDGE = 360;

/** Photos per camera point. */
export const PHOTO_MAX_PER_CAMERA = 30;

export interface CameraPhoto {
  id: string;
  cameraPointId: string;
  /** Same-origin URLs served by the API (session cookie required). */
  url: string;
  thumbUrl: string;
  /** Always image/jpeg: the server re-encodes every upload. */
  contentType: 'image/jpeg';
  /** Bytes of the stored photo (not the thumbnail). */
  fileSize: number;
  width: number;
  height: number;
  photoType: PhotoType;
  caption?: string;
  /** The user who uploaded it, and their display name. */
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
}
