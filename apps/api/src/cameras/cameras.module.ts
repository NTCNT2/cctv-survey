import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module.js';
import { CamerasController } from './cameras.controller.js';
import { CamerasService } from './cameras.service.js';

@Module({
  imports: [ProjectsModule],
  controllers: [CamerasController],
  providers: [CamerasService],
})
export class CamerasModule {}
