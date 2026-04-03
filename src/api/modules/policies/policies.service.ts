import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
  // New operator-configurable scheduling rules
  lessonBufferMinutes?: number;
  minBookingNoticeHours?: number;
  maxInstructorFlightsPerDay?: number;
  maxStudentFlightsPerDay?: number;
  maxInstructorDutyHours?: number;
  requireInstructorTypeMatch?: boolean;
  instructorContinuityWeight?: number;
  preferredTimeBlock?: string;
  cancellationReschedulePriority?: number;
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
   * System policy ceilings are enforced by the controller.
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
        // New scheduling rule fields
        ...(data.lessonBufferMinutes !== undefined && {
          lessonBufferMinutes: data.lessonBufferMinutes,
        }),
        ...(data.minBookingNoticeHours !== undefined && {
          minBookingNoticeHours: data.minBookingNoticeHours,
        }),
        ...(data.maxInstructorFlightsPerDay !== undefined && {
          maxInstructorFlightsPerDay: data.maxInstructorFlightsPerDay,
        }),
        ...(data.maxStudentFlightsPerDay !== undefined && {
          maxStudentFlightsPerDay: data.maxStudentFlightsPerDay,
        }),
        ...(data.maxInstructorDutyHours !== undefined && {
          maxInstructorDutyHours: data.maxInstructorDutyHours,
        }),
        ...(data.requireInstructorTypeMatch !== undefined && {
          requireInstructorTypeMatch: data.requireInstructorTypeMatch,
        }),
        ...(data.instructorContinuityWeight !== undefined && {
          instructorContinuityWeight: data.instructorContinuityWeight,
        }),
        ...(data.preferredTimeBlock !== undefined && {
          preferredTimeBlock: data.preferredTimeBlock,
        }),
        ...(data.cancellationReschedulePriority !== undefined && {
          cancellationReschedulePriority: data.cancellationReschedulePriority,
        }),
        updatedAt: new Date(),
      })
      .where(eq(schedulingPolicies.id, existing.id))
      .returning();

    return updated;
  }

  /**
   * Validate policy field ranges:
   * - pollingIntervalMinutes: 2-5
   * - rescheduleAlternativesCount: 3-10
   * - searchWindowInitialDays: 1-28
   * - searchWindowIncrementDays: 1-14
   * - searchWindowMaxDays: 7-56
   * - suggestionTtlHours: 1-168 (1 hour to 7 days)
   * - lessonBufferMinutes: 15-60
   * - minBookingNoticeHours: 2-72
   * - maxInstructorFlightsPerDay: 1-8
   * - maxStudentFlightsPerDay: 1-3
   * - maxInstructorDutyHours: 1-8
   * - instructorContinuityWeight: 0-100
   * - cancellationReschedulePriority: 1-5
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
      (data.rescheduleAlternativesCount < 3 || data.rescheduleAlternativesCount > 10)
    ) {
      errors.push('rescheduleAlternativesCount must be between 3 and 10');
    }

    if (
      data.searchWindowInitialDays !== undefined &&
      (data.searchWindowInitialDays < 1 || data.searchWindowInitialDays > 28)
    ) {
      errors.push('searchWindowInitialDays must be between 1 and 28');
    }

    if (
      data.searchWindowIncrementDays !== undefined &&
      (data.searchWindowIncrementDays < 1 || data.searchWindowIncrementDays > 14)
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

    if (
      data.lessonBufferMinutes !== undefined &&
      (data.lessonBufferMinutes < 15 || data.lessonBufferMinutes > 60)
    ) {
      errors.push('lessonBufferMinutes must be between 15 and 60');
    }

    if (
      data.minBookingNoticeHours !== undefined &&
      (data.minBookingNoticeHours < 2 || data.minBookingNoticeHours > 72)
    ) {
      errors.push('minBookingNoticeHours must be between 2 and 72');
    }

    if (
      data.maxInstructorFlightsPerDay !== undefined &&
      (data.maxInstructorFlightsPerDay < 1 || data.maxInstructorFlightsPerDay > 8)
    ) {
      errors.push('maxInstructorFlightsPerDay must be between 1 and 8');
    }

    if (
      data.maxStudentFlightsPerDay !== undefined &&
      (data.maxStudentFlightsPerDay < 1 || data.maxStudentFlightsPerDay > 3)
    ) {
      errors.push('maxStudentFlightsPerDay must be between 1 and 3');
    }

    if (
      data.maxInstructorDutyHours !== undefined &&
      (data.maxInstructorDutyHours < 1 || data.maxInstructorDutyHours > 8)
    ) {
      errors.push('maxInstructorDutyHours must be between 1 and 8');
    }

    if (
      data.instructorContinuityWeight !== undefined &&
      (data.instructorContinuityWeight < 0 || data.instructorContinuityWeight > 100)
    ) {
      errors.push('instructorContinuityWeight must be between 0 and 100');
    }

    if (
      data.cancellationReschedulePriority !== undefined &&
      (data.cancellationReschedulePriority < 1 || data.cancellationReschedulePriority > 5)
    ) {
      errors.push('cancellationReschedulePriority must be between 1 and 5');
    }

    if (
      data.preferredTimeBlock !== undefined &&
      !['morning', 'afternoon', 'all_day'].includes(data.preferredTimeBlock)
    ) {
      errors.push("preferredTimeBlock must be one of: 'morning', 'afternoon', 'all_day'");
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }
  }
}
