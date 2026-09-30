import {
  createSiteSchema,
  updateSiteSchema,
  type CreateSiteInput,
  type Site,
  type UpdateSiteInput,
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
} from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ProjectsService } from '../projects/projects.service.js';
import { SitesService } from './sites.service.js';

@Controller()
export class SitesController {
  constructor(
    private readonly sites: SitesService,
    private readonly projects: ProjectsService,
  ) {}

  @Get('projects/:projectId/sites')
  async listByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<Site[]> {
    await this.projects.assertExists(projectId);
    return this.sites.listByProject(projectId);
  }

  @Get('sites/:id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Site> {
    return this.sites.get(id);
  }

  @Post('sites')
  create(
    @Body(new ZodValidationPipe(createSiteSchema)) body: CreateSiteInput,
  ): Promise<Site> {
    return this.sites.create(body);
  }

  @Patch('sites/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSiteSchema)) body: UpdateSiteInput,
  ): Promise<Site> {
    return this.sites.update(id, body);
  }

  @Delete('sites/:id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.sites.remove(id);
  }
}
