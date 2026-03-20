import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { db } from '../../../db/index.js';
import { schedulingPolicies } from '../../../db/schema/index.js';
import { eq } from 'drizzle-orm';

export interface UpdatePolicyDto {
  waitlistWeights?: Record<string, unknown>;
  rescheduleAlternativesCount?: number;
  searchWindowInitialDays?: number;
  searchWindowIncrementDays?: number;
  searchWindowMaxDays?: number;
  suggestionTtlHours?: number;
  pollingIntervalMinutes?: number;
  notificationPreferences?: Record<string, unknown>;
}

@Injectable()
export class PoliciesService {
  /**
   * Get the scheduling policy for an operator.
   * Each operator has exactly one policy row (created during onboarding).
   */
  async getPolicy(operatorId: number) {
    const [policy] = await db
      .select()
      .from(schedulingPolicies)
      .where(eq(schedulingPolicies.operatorId, operatorId))
      .limit(1);

    if (!policy) {
      throw new NotFoundException(
        `No scheduling policy found for operator ${operatorId}. Has onboarding completed?`,
      );
    }

    return policy;
  }

  /**
   * Update the scheduling policy for an operator.
   * Validates business-rule ranges before persisting.
   */
  async updatePolicy(operatorId: number, data: UpdatePolicyDto) {
    // Validate ranges per PRD constraints
    this.validatePolicyRanges(data);

    // Verify policy exists
    const existing = await this.getPolicy(operatorId);

    const [updated] = await db
      .update(schedulingPolicies)
      .set({
        ...(data.waitlistWeights !== undefined && {
          waitlistWeights: data.waitlistWeights,
        }),
        ...(data.rescheduleAlternativesCount !== undefined && {
          rescheduleAlternativesCount: data.rescheduleAlternativesCount,
        }),
        ...(data.searchWindowInitialDays !== undefined && {
          searchWindowInitialDays: data.searchWindowInitialDays,
        }),
        ...(data.searchWindowIncrementDays !== undefined && {
          searchWindowIncrementDays: data.searchWindowIncrementDays,
        }),
        ...(data.searchWindowMaxDays !== undefined && {
          searchWindowMaxDays: data.searchWindowMaxDays,
        }),
        ...(data.suggestionTtlHours !== undefined && {
          suggestionTtlHours: data.suggestionTtlHours,
        }),
        ...(data.pollingIntervalMinutes !== undefined && {
          pollingIntervalMinutes: data.pollingIntervalMinutes,
        }),
        ...(data.notificationPreferences !== undefined && {
          notificationPreferences: data.notificationPreferences,
        }),
        updatedAt: new Date(),
      })
      .where(eq(schedulingPolicies.id, existing.id))
      .returning();

    return updated;
  }

  /**
   * Validate policy field ranges per PRD:
   * - pollingIntervalMinutes: 2-5
   * - rescheduleAlternativesCount: 3-10
   * - searchWindowInitialDays: 1-28
   * - searchWindowIncrementDays: 1-14
   * - searchWindowMaxDays: 7-56
   * - suggestionTtlHours: 1-168 (1 hour to 7 days)
   */
  private validatePolicyRanges(data: UpdatePolicyDto): void {
    const errors: string[] = [];

    if (
      data.pollingIntervalMinutes !== undefined &&
      (data.pollingIntervalMinutes < 2 || data.pollingIntervalMinutes > 5)
    ) {
      errors.push('pollingIntervalMinutes must be between 2 and 5');
    }

    if (
      data.rescheduleAlternativesCount !== undefined &&
      (data.rescheduleAlternativesCount < 3 ||
        data.rescheduleAlternativesCount > 10)
    ) {
      errors.push('rescheduleAlternativesCount must be between 3 and 10');
    }

    if (
      data.searchWindowInitialDays !== undefined &&
      (data.searchWindowInitialDays < 1 ||
        data.searchWindowInitialDays > 28)
    ) {
      errors.push('searchWindowInitialDays must be between 1 and 28');
    }

    if (
      data.searchWindowIncrementDays !== undefined &&
      (data.searchWindowIncrementDays < 1 ||
        data.searchWindowIncrementDays > 14)
    ) {
      errors.push('searchWindowIncrementDays must be between 1 and 14');
    }

    if (
      data.searchWindowMaxDays !== undefined &&
      (data.searchWindowMaxDays < 7 || data.searchWindowMaxDays > 56)
    ) {
      errors.push('searchWindowMaxDays must be between 7 and 56');
    }

    if (
      data.suggestionTtlHours !== undefined &&
      (data.suggestionTtlHours < 1 || data.suggestionTtlHours > 168)
    ) {
      errors.push('suggestionTtlHours must be between 1 and 168');
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }
  }
}
