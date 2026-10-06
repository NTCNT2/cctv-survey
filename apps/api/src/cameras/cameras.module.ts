import { Module } from '@nestjs/common';
import { CameraModelsModule } from '../camera-models/camera-models.module.js';
import { PhotosModule } from '../photos/photos.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { CamerasController } from './cameras.controller.js';
import { CamerasService } from './cameras.service.js';

@Module({
  imports: [ProjectsModule, CameraModelsModule, PhotosModule],
  controllers: [CamerasController],
  providers: [CamerasService],
})
export class CamerasModule {}
