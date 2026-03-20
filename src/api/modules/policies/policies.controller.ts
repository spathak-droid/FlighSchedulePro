import {
  Controller,
  Get,
  Put,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { PoliciesService, UpdatePolicyDto } from './policies.service.js';
import type { AuthenticatedRequest } from '../../common/interfaces/index.js';

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
  async updatePolicy(@Req() req: AuthenticatedRequest, @Body() body: UpdatePolicyDto) {
    // Validate numeric fields are actually numbers (JSON body parsing can pass strings)
    const numericFields: Array<keyof UpdatePolicyDto> = [
      'rescheduleAlternativesCount',
      'searchWindowInitialDays',
      'searchWindowIncrementDays',
      'searchWindowMaxDays',
      'suggestionTtlHours',
      'pollingIntervalMinutes',
    ];
    for (const field of numericFields) {
      if (
        body[field] !== undefined &&
        (typeof body[field] !== 'number' || !Number.isFinite(body[field] as number))
      ) {
        throw new BadRequestException(`${field} must be a finite number`);
      }
    }

    const updated = await this.policiesService.updatePolicy(req.user.operatorId, body);
    return { data: updated };
  }
}
