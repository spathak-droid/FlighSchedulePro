import { Controller, Get, Post, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { StudentInsightsService } from './student-insights.service.js';

interface AuthenticatedRequest {
  user: {
    userId: string;
    email: string;
    operatorId: number;
    permissions: string[];
  };
}

@Controller('insights')
export class InsightsController {
  constructor(private readonly studentInsightsService: StudentInsightsService) {}

  /**
   * GET /api/v1/insights
   * Returns combined insights: inactive students, checkride-ready, at-risk, instructor workload.
   */
  @Get()
  async getInsights(@Req() req: AuthenticatedRequest) {
    const insights = await this.studentInsightsService.getAllInsights(req.user.operatorId);
    return { data: insights };
  }

  /**
   * POST /api/v1/insights/refresh
   * Recomputes and caches insights in student_insights table.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshInsights(@Req() req: AuthenticatedRequest) {
    const insights = await this.studentInsightsService.refreshInsights(req.user.operatorId);
    return { data: insights, message: 'Insights refreshed successfully' };
  }
}
