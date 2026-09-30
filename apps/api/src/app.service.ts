import { Injectable } from '@nestjs/common';
import type { HealthStatus } from '@cctv/shared';

@Injectable()
export class AppService {
  getHealth(): HealthStatus {
    return {
      status: 'ok',
      service: 'cctv-survey-api',
      version: process.env.npm_package_version ?? '0.0.0',
      time: new Date().toISOString(),
    };
  }
}
