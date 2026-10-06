import {
  PHOTO_MAX_BYTES,
  PHOTO_UPLOAD_TYPES,
  photoFileQuerySchema,
  updatePhotoSchema,
  uploadPhotoQuerySchema,
  type AuthUser,
  type CameraPhoto,
  type UpdatePhotoInput,
  type UploadPhotoQuery,
} from '@cctv/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  Res,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PhotosService } from './photos.service.js';

/**
 * Reads a raw request body of at most `max` bytes. The JSON body parser
 * leaves image/* bodies alone, so the stream is still unread here.
 */
function readBody(req: Request, max: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? Number.NaN);
  if (declared > max) {
    return Promise.reject(
      new PayloadTooLargeException(`photo must be at most ${max} bytes`),
    );
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) {
        req.removeAllListeners('data');
        req.resume();
        reject(
          new PayloadTooLargeException(`photo must be at most ${max} bytes`),
        );
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const photoParams = {
  id: new ParseUUIDPipe(),
  photoId: new ParseUUIDPipe(),
};

/**
 * Photos are addressed through their camera point: a photo id together with
 * another camera's id is a 404, never that photo.
 */
@Controller('cameras/:id/photos')
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @RequirePermission('camera:read')
  @Get()
  list(@Param('id', photoParams.id) id: string): Promise<CameraPhoto[]> {
    return this.photos.listByCamera(id);
  }

  /**
   * One photo per request, sent as the raw body with its image Content-Type
   * (see app.setup.ts: the only non-JSON body the API accepts). Type and
   * caption come as query parameters.
   */
  @RequirePermission('camera:write')
  @Post()
  async upload(
    @Param('id', photoParams.id) id: string,
    @Query(new ZodValidationPipe(uploadPhotoQuerySchema))
    query: UploadPhotoQuery,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ): Promise<CameraPhoto> {
    if (!req.is([...PHOTO_UPLOAD_TYPES])) {
      throw new UnsupportedMediaTypeException(
        'photo must be image/jpeg, image/png or image/webp',
      );
    }
    const body = await readBody(req, PHOTO_MAX_BYTES);
    if (body.length === 0) throw new BadRequestException('photo is empty');
    return this.photos.add(id, body, query, user.id);
  }

  /** The photo, or its thumbnail with `?size=thumb`. */
  @RequirePermission('camera:read')
  @Get(':photoId/file')
  async file(
    @Param('id', photoParams.id) id: string,
    @Param('photoId', photoParams.photoId) photoId: string,
    @Query(new ZodValidationPipe(photoFileQuerySchema))
    query: z.infer<typeof photoFileQuerySchema>,
    @Res() res: Response,
  ) {
    const abs = await this.photos.filePath(id, photoId, query.size);
    await sendJpeg(abs, res);
  }

  @RequirePermission('camera:write')
  @Patch(':photoId')
  update(
    @Param('id', photoParams.id) id: string,
    @Param('photoId', photoParams.photoId) photoId: string,
    @Body(new ZodValidationPipe(updatePhotoSchema)) body: UpdatePhotoInput,
  ): Promise<CameraPhoto> {
    return this.photos.update(id, photoId, body);
  }

  @RequirePermission('camera:write')
  @Delete(':photoId')
  @HttpCode(204)
  remove(
    @Param('id', photoParams.id) id: string,
    @Param('photoId', photoParams.photoId) photoId: string,
  ): Promise<void> {
    return this.photos.remove(id, photoId);
  }
}

/**
 * Always a JPEG written by the API itself. Cache-Control stays `no-store`
 * (app.setup.ts): photos are customer data, like every other response.
 * The CSP sandbox keeps the file inert even if opened directly.
 */
function sendJpeg(abs: string, res: Response): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    res.sendFile(
      abs,
      {
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Disposition': 'inline',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
        cacheControl: false,
        lastModified: false,
        etag: false,
        dotfiles: 'deny',
      },
      (err?: Error) => {
        if (!err) return resolve();
        if (res.headersSent) return resolve();
        const code = (err as NodeJS.ErrnoException).code;
        reject(
          code === 'ENOENT'
            ? new NotFoundException('photo file not found')
            : err,
        );
      },
    );
  });
}
