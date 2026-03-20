import { Controller, Get, Put, Param, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { FeatureFlagService } from './feature-flag.service.js';

interface AuthenticatedRequest {
  user: {
    userId: string;
    email: string;
    operatorId: number;
    permissions: string[];
  };
}

interface UpdateFlagBody {
  enabled: boolean;
  config?: Record<string, unknown>;
}

@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlagService: FeatureFlagService) {}

  /**
   * GET /api/v1/feature-flags
   * List all feature flags for the authenticated operator.
   */
  @Get()
  async listFlags(@Req() req: AuthenticatedRequest) {
    const flags = await this.featureFlagService.listFlags(req.user.operatorId);
    return { data: flags };
  }

  /**
   * PUT /api/v1/feature-flags/:flagName
   * Update a feature flag for the authenticated operator.
   */
  @Put(':flagName')
  @HttpCode(HttpStatus.OK)
  async updateFlag(
    @Req() req: AuthenticatedRequest,
    @Param('flagName') flagName: string,
    @Body() body: UpdateFlagBody,
  ) {
    const flag = await this.featureFlagService.setFlag(
      req.user.operatorId,
      flagName,
      body.enabled,
      body.config,
    );
    return { data: flag };
  }
}
