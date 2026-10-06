import { Module } from '@nestjs/common';
import { CameraModelsController } from './camera-models.controller.js';
import { CameraModelsService } from './camera-models.service.js';

@Module({
  controllers: [CameraModelsController],
  providers: [CameraModelsService],
  exports: [CameraModelsService],
})
export class CameraModelsModule {}
