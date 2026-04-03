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
import { SYSTEM_POLICIES } from '../../../core/scheduling/system-policies.js';
import {
  MAX_INSTRUCTOR_DUTY_HOURS_PER_DAY,
  MAX_STUDENT_FLIGHTS_PER_DAY,
  MAX_INSTRUCTOR_FLIGHTS_PER_DAY,
  MIN_AIRCRAFT_TURNAROUND_MINUTES,
  MIN_BOOKING_NOTICE_HOURS,
} from '../../../core/scheduling/system-policies.js';

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
   * GET /api/v1/policies/system
   * Returns fixed system policies (regulatory + safety). Read-only.
   * These CANNOT be overridden by operators.
   */
  @Get('system')
  getSystemPolicies() {
    return {
      data: {
        policies: SYSTEM_POLICIES,
        constraints: {
          maxInstructorDutyHours: MAX_INSTRUCTOR_DUTY_HOURS_PER_DAY,
          maxStudentFlightsPerDay: MAX_STUDENT_FLIGHTS_PER_DAY,
          maxInstructorFlightsPerDay: MAX_INSTRUCTOR_FLIGHTS_PER_DAY,
          minAircraftTurnaroundMinutes: MIN_AIRCRAFT_TURNAROUND_MINUTES,
          minBookingNoticeHours: MIN_BOOKING_NOTICE_HOURS,
        },
        description:
          'System policies are fixed regulatory and safety constraints that cannot be overridden. ' +
          'Operator policies may set stricter limits (e.g., fewer flights per day) but never looser.',
      },
    };
  }

  /**
   * PUT /api/v1/policies
   * Updates the scheduling policy for the authenticated operator.
   * Validates that operator values don't exceed system maximums.
   */
  @Put()
  @HttpCode(HttpStatus.OK)
  async updatePolicy(@Req() req: AuthenticatedRequest, @Body() body: UpdatePolicyDto) {
    // Validate numeric fields are actually numbers
    const numericFields: Array<keyof UpdatePolicyDto> = [
      'rescheduleAlternativesCount',
      'searchWindowInitialDays',
      'searchWindowIncrementDays',
      'searchWindowMaxDays',
      'suggestionTtlHours',
      'pollingIntervalMinutes',
      'lessonBufferMinutes',
      'minBookingNoticeHours',
      'maxInstructorFlightsPerDay',
      'maxStudentFlightsPerDay',
      'maxInstructorDutyHours',
      'instructorContinuityWeight',
      'cancellationReschedulePriority',
    ];
    for (const field of numericFields) {
      if (
        body[field] !== undefined &&
        (typeof body[field] !== 'number' || !Number.isFinite(body[field] as number))
      ) {
        throw new BadRequestException(`${field} must be a finite number`);
      }
    }

    // Enforce system policy ceilings — operator cannot set looser than system max
    if (
      body.maxInstructorDutyHours !== undefined &&
      body.maxInstructorDutyHours > MAX_INSTRUCTOR_DUTY_HOURS_PER_DAY
    ) {
      throw new BadRequestException(
        `maxInstructorDutyHours cannot exceed system maximum of ${MAX_INSTRUCTOR_DUTY_HOURS_PER_DAY}h`,
      );
    }

    if (
      body.maxInstructorFlightsPerDay !== undefined &&
      body.maxInstructorFlightsPerDay > MAX_INSTRUCTOR_FLIGHTS_PER_DAY
    ) {
      throw new BadRequestException(
        `maxInstructorFlightsPerDay cannot exceed system maximum of ${MAX_INSTRUCTOR_FLIGHTS_PER_DAY}`,
      );
    }

    if (
      body.maxStudentFlightsPerDay !== undefined &&
      body.maxStudentFlightsPerDay > MAX_STUDENT_FLIGHTS_PER_DAY
    ) {
      throw new BadRequestException(
        `maxStudentFlightsPerDay cannot exceed system maximum of ${MAX_STUDENT_FLIGHTS_PER_DAY}`,
      );
    }

    if (
      body.minBookingNoticeHours !== undefined &&
      body.minBookingNoticeHours < MIN_BOOKING_NOTICE_HOURS
    ) {
      throw new BadRequestException(
        `minBookingNoticeHours cannot be less than system minimum of ${MIN_BOOKING_NOTICE_HOURS}h`,
      );
    }

    if (
      body.lessonBufferMinutes !== undefined &&
      body.lessonBufferMinutes < MIN_AIRCRAFT_TURNAROUND_MINUTES
    ) {
      throw new BadRequestException(
        `lessonBufferMinutes cannot be less than system minimum turnaround of ${MIN_AIRCRAFT_TURNAROUND_MINUTES}min`,
      );
    }

    const updated = await this.policiesService.updatePolicy(req.user.operatorId, body);
    return { data: updated };
  }
}
