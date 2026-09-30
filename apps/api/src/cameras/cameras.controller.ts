import {
  createCameraPointSchema,
  updateCameraPointSchema,
  type CameraPoint,
  type CreateCameraPointInput,
  type UpdateCameraPointInput,
} from '@cctv/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ProjectsService } from '../projects/projects.service.js';
import { CamerasService } from './cameras.service.js';

const listQuerySchema = z.object({ siteId: z.uuid().optional() });

@Controller()
export class CamerasController {
  constructor(
    private readonly cameras: CamerasService,
    private readonly projects: ProjectsService,
  ) {}

  @Get('projects/:projectId/cameras')
  async listByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query(new ZodValidationPipe(listQuerySchema))
    query: z.infer<typeof listQuerySchema>,
  ): Promise<CameraPoint[]> {
    await this.projects.assertExists(projectId);
    return this.cameras.listByProject(projectId, query.siteId);
  }

  @Get('cameras/:id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<CameraPoint> {
    return this.cameras.get(id);
  }

  @Post('cameras')
  create(
    @Body(new ZodValidationPipe(createCameraPointSchema))
    body: CreateCameraPointInput,
  ): Promise<CameraPoint> {
    return this.cameras.create(body);
  }

  @Patch('cameras/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCameraPointSchema))
    body: UpdateCameraPointInput,
  ): Promise<CameraPoint> {
    return this.cameras.update(id, body);
  }

  @Delete('cameras/:id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.cameras.remove(id);
  }
}
