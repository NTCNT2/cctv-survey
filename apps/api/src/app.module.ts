import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { CameraModelsModule } from './camera-models/camera-models.module.js';
import { CamerasModule } from './cameras/cameras.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { PgErrorFilter } from './common/pg-error.filter.js';
import { DatabaseModule } from './db/database.module.js';
import { PhotosModule } from './photos/photos.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { SitesModule } from './sites/sites.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // apps/api/.env first, then the monorepo root .env
      envFilePath: ['.env', '../../.env'],
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    SitesModule,
    CameraModelsModule,
    CamerasModule,
    PhotosModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_FILTER, useClass: PgErrorFilter }],
})
export class AppModule {}
