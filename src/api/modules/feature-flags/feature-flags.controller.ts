import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FeatureFlagService } from './feature-flag.service.js';
import type { AuthenticatedRequest } from '../../common/interfaces/index.js';

interface UpdateFlagBody {
  enabled: boolean;
  config?: Record<string, unknown>;
}

/** Only allow alphanumeric, hyphens, underscores in flag names. */
const FLAG_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

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
    if (!FLAG_NAME_PATTERN.test(flagName)) {
      throw new BadRequestException(
        'flagName must be 1-100 characters, alphanumeric with hyphens/underscores only',
      );
    }
    if (typeof body.enabled !== 'boolean') {
      throw new BadRequestException('enabled must be a boolean');
    }
    if (body.config !== undefined && (typeof body.config !== 'object' || body.config === null)) {
      throw new BadRequestException('config must be an object if provided');
    }

    const flag = await this.featureFlagService.setFlag(
      req.user.operatorId,
      flagName,
      body.enabled,
      body.config,
    );
    return { data: flag };
  }
}
