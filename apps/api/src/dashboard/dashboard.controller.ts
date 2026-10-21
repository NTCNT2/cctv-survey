import type { DashboardSummary } from '@cctv/shared';
import { Controller, Get } from '@nestjs/common';
import { RequirePermission } from '../auth/decorators.js';
import { DashboardService } from './dashboard.service.js';

/** Overview counts for every role that may read projects and cameras. */
@Controller('dashboard')
@RequirePermission('camera:read')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  summary(): Promise<DashboardSummary> {
    return this.dashboard.summary();
  }
}
