import {
  PHOTO_MAX_EDGE,
  PHOTO_MAX_PER_CAMERA,
  PHOTO_THUMB_EDGE,
  type CameraPhoto,
  type UpdatePhotoInput,
  type UploadPhotoQuery,
} from '@cctv/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql, type Selectable } from 'kysely';
import sharp from 'sharp';
import { Database } from '../db/database.js';
import type { CameraPhotosTable } from '../db/types.js';
import { PhotoStorage } from './photo-storage.js';

// One image at a time per worker thread, no decoded-image cache: the API
// container is small and photos are rare compared with JSON requests.
sharp.cache(false);
sharp.concurrency(1);

/** Larger images (e.g. a 200 MP panorama) are rejected before decoding. */
const MAX_INPUT_PIXELS = 60_000_000;

const columns = [
  'id',
  'camera_point_id',
  'file_key',
  'thumb_key',
  'content_type',
  'size_bytes',
  'width',
  'height',
  'photo_type',
  'caption',
  'uploaded_by',
  'created_at',
  sql<string | null>`(
    SELECT coalesce(display_name, username) FROM users
    WHERE users.id = camera_photos.uploaded_by
  )`.as('uploaded_by_name'),
] as const;

type Row = Selectable<CameraPhotosTable> & {
  uploaded_by_name: string | null;
};

/** DB columns size_bytes / uploaded_by are fileSize / createdBy in the API. */
function toPhoto(r: Row): CameraPhoto {
  const file = `/api/cameras/${r.camera_point_id}/photos/${r.id}/file`;
  return {
    id: r.id,
    cameraPointId: r.camera_point_id,
    url: file,
    thumbUrl: `${file}?size=thumb`,
    contentType: r.content_type,
    fileSize: r.size_bytes,
    width: r.width,
    height: r.height,
    photoType: r.photo_type,
    caption: r.caption ?? undefined,
    createdBy: r.uploaded_by ?? undefined,
    createdByName: r.uploaded_by_name ?? undefined,
    createdAt: r.created_at.toISOString(),
  };
}

/**
 * Decodes the upload and writes fresh JPEGs (photo + thumbnail). Only pixels
 * survive: EXIF / XMP metadata and anything appended to the file are dropped,
 * and the orientation tag is applied to the pixels.
 */
async function reencode(input: Buffer) {
  const img = sharp(input, {
    failOn: 'error',
    limitInputPixels: MAX_INPUT_PIXELS,
  });
  const meta = await img.metadata();
  if (!['jpeg', 'png', 'webp'].includes(meta.format)) {
    throw new Error(`unsupported format ${meta.format}`);
  }
  const photo = await img
    .clone()
    .rotate()
    .resize(PHOTO_MAX_EDGE, PHOTO_MAX_EDGE, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  const thumb = await img
    .clone()
    .rotate()
    .resize(PHOTO_THUMB_EDGE, PHOTO_THUMB_EDGE, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 70 })
    .toBuffer();
  return { photo, thumb };
}

@Injectable()
export class PhotosService {
  constructor(
    private readonly db: Database,
    private readonly storage: PhotoStorage,
  ) {}

  async listByCamera(cameraId: string): Promise<CameraPhoto[]> {
    await this.assertCamera(cameraId);
    const rows = await this.db
      .selectFrom('camera_photos')
      .select(columns)
      .where('camera_point_id', '=', cameraId)
      .orderBy('created_at')
      .orderBy('id')
      .execute();
    return rows.map(toPhoto);
  }

  async add(
    cameraId: string,
    body: Buffer,
    meta: UploadPhotoQuery,
    uploadedBy: string,
  ): Promise<CameraPhoto> {
    await this.assertCamera(cameraId);
    const { n } = await this.db
      .selectFrom('camera_photos')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('camera_point_id', '=', cameraId)
      .executeTakeFirstOrThrow();
    if (Number(n) >= PHOTO_MAX_PER_CAMERA) {
      throw new ConflictException(
        `a camera point can have at most ${PHOTO_MAX_PER_CAMERA} photos`,
      );
    }

    let img: Awaited<ReturnType<typeof reencode>>;
    try {
      img = await reencode(body);
    } catch {
      throw new BadRequestException('the file is not a valid image');
    }

    const keys = this.storage.newKeys();
    await this.storage.write(keys.file, img.photo.data);
    try {
      await this.storage.write(keys.thumb, img.thumb);
      const row = await this.db
        .insertInto('camera_photos')
        .values({
          camera_point_id: cameraId,
          file_key: keys.file,
          thumb_key: keys.thumb,
          content_type: 'image/jpeg',
          size_bytes: img.photo.info.size,
          width: img.photo.info.width,
          height: img.photo.info.height,
          photo_type: meta.type,
          caption: meta.caption || null,
          uploaded_by: uploadedBy,
        })
        .returning(columns)
        .executeTakeFirstOrThrow();
      return toPhoto(row);
    } catch (err) {
      // e.g. the point was deleted meanwhile (FK): leave no orphaned files.
      await this.storage.remove(keys.file, keys.thumb);
      throw err;
    }
  }

  /** Only photo `photoId` of camera `cameraId`: another camera's id is a 404. */
  async update(
    cameraId: string,
    photoId: string,
    input: UpdatePhotoInput,
  ): Promise<CameraPhoto> {
    const row = await this.db
      .updateTable('camera_photos')
      .set({ photo_type: input.photoType, caption: input.caption })
      .where('id', '=', photoId)
      .where('camera_point_id', '=', cameraId)
      .returning(columns)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('photo not found');
    return toPhoto(row);
  }

  /** Absolute path of the photo or its thumbnail, for streaming. */
  async filePath(
    cameraId: string,
    photoId: string,
    size: 'original' | 'thumb',
  ): Promise<string> {
    const row = await this.db
      .selectFrom('camera_photos')
      .select(['file_key', 'thumb_key'])
      .where('id', '=', photoId)
      .where('camera_point_id', '=', cameraId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('photo not found');
    return this.storage.resolve(
      size === 'thumb' ? row.thumb_key : row.file_key,
    );
  }

  async remove(cameraId: string, photoId: string): Promise<void> {
    const row = await this.db
      .deleteFrom('camera_photos')
      .where('id', '=', photoId)
      .where('camera_point_id', '=', cameraId)
      .returning(['file_key', 'thumb_key'])
      .executeTakeFirst();
    if (!row) throw new NotFoundException('photo not found');
    await this.storage.remove(row.file_key, row.thumb_key);
  }

  private async assertCamera(id: string): Promise<void> {
    const row = await this.db
      .selectFrom('camera_points')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('camera point not found');
  }
}
