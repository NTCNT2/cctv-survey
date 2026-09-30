import {
  createProjectSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type Project,
  type UpdateProjectInput,
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
import { pageQuerySchema, type PageQuery } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ProjectsService } from './projects.service.js';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(pageQuerySchema)) page: PageQuery,
  ): Promise<Project[]> {
    return this.projects.list(page);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Project> {
    return this.projects.get(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput,
  ): Promise<Project> {
    return this.projects.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProjectInput,
  ): Promise<Project> {
    return this.projects.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.projects.remove(id);
  }
}
