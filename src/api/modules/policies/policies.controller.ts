import {
  Controller,
  Get,
  Put,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PoliciesService, UpdatePolicyDto } from './policies.service.js';

interface AuthenticatedRequest {
  user: {
    userId: string;
    email: string;
    operatorId: number;
    permissions: string[];
  };
}

@Controller('policies')
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  /**
   * GET /api/v1/policies
   * Returns the scheduling policy for the authenticated operator.
   */
  @Get()
  async getPolicy(@Req() req: AuthenticatedRequest) {
    const policy = await this.policiesService.getPolicy(req.user.operatorId);
    return { data: policy };
  }

  /**
   * PUT /api/v1/policies
   * Updates the scheduling policy for the authenticated operator.
   */
  @Put()
  @HttpCode(HttpStatus.OK)
  async updatePolicy(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdatePolicyDto,
  ) {
    const updated = await this.policiesService.updatePolicy(
      req.user.operatorId,
      body,
    );
    return { data: updated };
  }
}
