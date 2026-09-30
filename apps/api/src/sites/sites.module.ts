import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { SitesController } from './sites.controller.js';
import { SitesService } from './sites.service.js';

@Module({
  imports: [ProjectsModule],
  controllers: [SitesController],
  providers: [SitesService],
})
export class SitesModule {}
