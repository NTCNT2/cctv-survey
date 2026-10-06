import { Module } from '@nestjs/common';
import { PhotoStorage } from './photo-storage.js';
import { PhotosController } from './photos.controller.js';
import { PhotosService } from './photos.service.js';

@Module({
  controllers: [PhotosController],
  providers: [PhotosService, PhotoStorage],
  exports: [PhotoStorage],
})
export class PhotosModule {}
