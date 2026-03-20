import { Controller, Get, Req } from '@nestjs/common';
import { DashboardService } from './dashboard.service.js';

interface AuthenticatedRequest {
  user: {
    userId: string;
    email: string;
    operatorId: number;
    permissions: string[];
  };
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /api/v1/dashboard/stats
   * Returns aggregate statistics for the scheduler approval console.
   *
   * Response shape:
   * {
   *   data: {
   *     pendingSuggestions: number,
   *     approvedToday: number,
   *     declinedToday: number,
   *     expiredToday: number,
   *     acceptanceRate: number | null  // percentage, e.g. 85.71
   *   }
   * }
   */
  @Get('stats')
  async getStats(@Req() req: AuthenticatedRequest) {
    const stats = await this.dashboardService.getStats(req.user.operatorId);
    return { data: stats };
  }
}
