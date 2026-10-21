import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { HealthStatus } from '@cctv/shared';
import { AppService } from './app.service.js';
import { Public } from './auth/decorators.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** 200 when the database answers, 503 otherwise (Docker marks unhealthy). */
  @Public()
  @Get('health')
  async getHealth(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthStatus> {
    const health = await this.appService.getHealth();
    if (health.status !== 'ok') res.status(503);
    return health;
  }
}
