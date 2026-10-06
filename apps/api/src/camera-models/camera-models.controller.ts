import {
  createCameraModelSchema,
  updateCameraModelSchema,
  type CameraModel,
  type CreateCameraModelInput,
  type UpdateCameraModelInput,
} from '@cctv/shared';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CameraModelsService } from './camera-models.service.js';

/**
 * Default: active models only (Quick Add). `active=false`: inactive only;
 * `all=true`: both (admin list).
 */
const listQuerySchema = z
  .object({
    active: z.enum(['true', 'false']).optional(),
    all: z.enum(['true', 'false']).optional(),
  })
  .refine((q) => !(q.all === 'true' && q.active !== undefined), {
    message: 'use either active or all, not both',
  });

/** No DELETE: a model that is no longer used is deactivated instead. */
@Controller('camera-models')
export class CameraModelsController {
  constructor(private readonly models: CameraModelsService) {}

  @RequirePermission('camera:read')
  @Get()
  list(
    @Query(new ZodValidationPipe(listQuerySchema))
    query: z.infer<typeof listQuerySchema>,
  ): Promise<CameraModel[]> {
    return this.models.list(
      query.all === 'true' ? undefined : query.active !== 'false',
    );
  }

  @RequirePermission('camera_model:manage')
  @Post()
  create(
    @Body(new ZodValidationPipe(createCameraModelSchema))
    body: CreateCameraModelInput,
  ): Promise<CameraModel> {
    return this.models.create(body);
  }

  @RequirePermission('camera_model:manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCameraModelSchema))
    body: UpdateCameraModelInput,
  ): Promise<CameraModel> {
    return this.models.update(id, body);
  }
}
