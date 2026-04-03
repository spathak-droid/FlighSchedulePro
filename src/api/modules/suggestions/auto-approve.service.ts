import { Injectable, Logger } from '@nestjs/common';
import { FeatureFlagService } from '../feature-flags/feature-flag.service.js';
import { SuggestionsService } from './suggestions.service.js';
import { AuditService } from '../activity/audit.service.js';
import { db } from '../../../db/index.js';
import { suggestions, schedulingPolicies, reservationHistory } from '../../../db/schema/index.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import {
  evaluateAllConstraints,
  DEFAULT_OPERATOR_POLICY,
} from '../../../core/scheduling/constraint-evaluator.js';
import type {
  OperatorPolicy,
  ExistingReservation,
} from '../../../core/scheduling/constraint-evaluator.js';

export interface AutoApproveResult {
  autoApproved: boolean;
  reason: string;
  constraintDetails?: {
    regulatory: boolean;
    safety: boolean;
    operator: boolean;
    preferenceScore: number;
    failedConstraints: string[];
  };
}

@Injectable()
export class AutoApproveService {
  private readonly logger = new Logger(AutoApproveService.name);

  constructor(
    private readonly featureFlagService: FeatureFlagService,
    private readonly suggestionsService: SuggestionsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Check if a suggestion qualifies for automatic approval and approve it if so.
   *
   * Safety gates (ALL must pass):
   * 1. `auto_approve` feature flag is enabled for the operator
   * 2. Suggestion status is `pending`
   * 3. Suggestion rationale has `aiEnriched === true`
   * 4. Suggestion rationale has a `riskLevel` that meets the threshold
   * 5. ALL 4-layer constraints pass (regulatory, safety, operator, preferences)
   *    - Layer 1 (Regulatory): FAA duty limits, daylight, flight caps
   *    - Layer 2 (Safety): Turnaround time, rest periods, booking notice
   *    - Layer 3 (Operator): Buffer, notice, flight limits per operator policy
   *    - Layer 4 (Preferences): Score must meet minimum threshold
   *
   * The risk threshold is configurable via the flag config:
   * - { riskThreshold: 'low' } — only auto-approve low-risk (default)
   * - { riskThreshold: 'medium' } — auto-approve low and medium risk
   */
  async checkAndAutoApprove(operatorId: number, suggestionId: string): Promise<AutoApproveResult> {
    // 1. Check if auto_approve flag is enabled
    const isEnabled = await this.featureFlagService.isEnabled(operatorId, 'auto_approve');
    if (!isEnabled) {
      return { autoApproved: false, reason: 'auto_approve flag is not enabled' };
    }

    // 2. Load the suggestion
    const [suggestion] = await db
      .select()
      .from(suggestions)
      .where(and(eq(suggestions.id, suggestionId), eq(suggestions.operatorId, operatorId)))
      .limit(1);

    if (!suggestion) {
      return { autoApproved: false, reason: 'suggestion not found' };
    }

    if (suggestion.status !== 'pending') {
      return {
        autoApproved: false,
        reason: `suggestion status is '${suggestion.status}', not 'pending'`,
      };
    }

    // 3. Check AI enrichment
    const rationale = suggestion.rationale as Record<string, unknown> | null;
    if (!rationale || rationale.aiEnriched !== true) {
      return { autoApproved: false, reason: 'suggestion has not been AI-enriched' };
    }

    // 4. Check risk level against threshold
    const riskLevel = rationale.riskLevel as string | undefined;
    if (!riskLevel) {
      return { autoApproved: false, reason: 'suggestion has no risk level' };
    }

    const flagConfig = await this.featureFlagService.getConfig(operatorId, 'auto_approve');
    const riskThreshold = (flagConfig.riskThreshold as string) ?? 'low';

    const allowedRiskLevels: string[] = riskThreshold === 'medium' ? ['low', 'medium'] : ['low'];

    if (!allowedRiskLevels.includes(riskLevel)) {
      return {
        autoApproved: false,
        reason: `risk level '${riskLevel}' does not meet threshold '${riskThreshold}'`,
      };
    }

    // 5. CONSTRAINT VERIFICATION — check ALL 4 layers before auto-approving
    if (suggestion.proposedStart && suggestion.proposedEnd) {
      const constraintCheck = await this.verifyConstraints(operatorId, suggestion);

      if (!constraintCheck.feasible) {
        const failedConstraints = constraintCheck.failedConstraints;

        this.logger.warn(
          `Auto-approve blocked for ${suggestionId}: constraint violations: ${failedConstraints.join(', ')}`,
        );

        // Record the failed attempt for audit
        await this.auditService.create({
          operatorId,
          eventType: 'suggestion_auto_approve_blocked',
          entityType: 'suggestion',
          entityId: suggestionId,
          actorId: 'system-auto',
          data: {
            riskLevel,
            riskThreshold,
            blockReason: 'constraint_violation',
            failedConstraints,
            layerSummary: constraintCheck.layerSummary,
          },
        });

        return {
          autoApproved: false,
          reason: `Constraint violations: ${failedConstraints.join('; ')}`,
          constraintDetails: {
            ...constraintCheck.layerSummary,
            failedConstraints,
          },
        };
      }
    }

    // All gates passed — auto-approve
    try {
      const fspToken = '';
      await this.suggestionsService.approve(operatorId, suggestionId, 'system-auto', fspToken);

      await this.auditService.create({
        operatorId,
        eventType: 'suggestion_auto_approved',
        entityType: 'suggestion',
        entityId: suggestionId,
        actorId: 'system-auto',
        data: {
          riskLevel,
          riskThreshold,
          aiEnriched: true,
          constraintsPassed: true,
          autoApproveReason: `All 4-layer constraints passed. Risk '${riskLevel}' meets threshold '${riskThreshold}'.`,
        },
      });

      this.logger.log(
        `Auto-approved suggestion ${suggestionId} for operator ${operatorId} ` +
          `(risk: ${riskLevel}, threshold: ${riskThreshold}, all constraints passed)`,
      );

      return {
        autoApproved: true,
        reason: `Auto-approved: risk '${riskLevel}' meets threshold '${riskThreshold}', all constraints satisfied`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Auto-approve failed for suggestion ${suggestionId}: ${errorMsg}`);
      return {
        autoApproved: false,
        reason: `auto-approve failed: ${errorMsg}`,
      };
    }
  }

  /**
   * Verify all 4-layer constraints against current schedule state.
   * This re-checks constraints at approval time (not just generation time)
   * to catch schedule changes that happened between generation and approval.
   */
  private async verifyConstraints(
    operatorId: number,
    suggestion: {
      studentId: string | null;
      proposedStart: Date | null;
      proposedEnd: Date | null;
      instructorId: string | null;
      aircraftId: string | null;
      activityTypeId: string | null;
      locationId: string | null;
    },
  ): Promise<{
    feasible: boolean;
    failedConstraints: string[];
    layerSummary: { regulatory: boolean; safety: boolean; operator: boolean; preferenceScore: number };
  }> {
    if (!suggestion.proposedStart || !suggestion.proposedEnd || !suggestion.studentId) {
      return {
        feasible: false,
        failedConstraints: ['missing_required_fields'],
        layerSummary: { regulatory: false, safety: false, operator: false, preferenceScore: 0 },
      };
    }

    // Load operator policy
    const [policyRow] = await db
      .select()
      .from(schedulingPolicies)
      .where(eq(schedulingPolicies.operatorId, operatorId))
      .limit(1);

    const policy: OperatorPolicy = policyRow
      ? {
          lessonBufferMinutes: policyRow.lessonBufferMinutes,
          minBookingNoticeHours: policyRow.minBookingNoticeHours,
          maxInstructorFlightsPerDay: policyRow.maxInstructorFlightsPerDay,
          maxStudentFlightsPerDay: policyRow.maxStudentFlightsPerDay,
          maxInstructorDutyHours: policyRow.maxInstructorDutyHours,
          requireInstructorTypeMatch: policyRow.requireInstructorTypeMatch,
          instructorContinuityWeight: policyRow.instructorContinuityWeight,
          preferredTimeBlock:
            typeof policyRow.preferredTimeBlock === 'string'
              ? policyRow.preferredTimeBlock
              : 'all_day',
        }
      : DEFAULT_OPERATOR_POLICY;

    // Load existing reservations for the day (for conflict/duty-time checks)
    const dayStart = new Date(suggestion.proposedStart);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(suggestion.proposedStart);
    dayEnd.setHours(23, 59, 59, 999);

    const dayReservations = await db
      .select({
        startTime: reservationHistory.startTime,
        endTime: reservationHistory.endTime,
        instructorId: reservationHistory.instructorId,
        aircraftId: reservationHistory.aircraftId,
        studentId: reservationHistory.studentId,
      })
      .from(reservationHistory)
      .where(
        and(
          eq(reservationHistory.operatorId, operatorId),
          lte(reservationHistory.startTime, dayEnd),
          gte(reservationHistory.endTime, dayStart),
          sql`${reservationHistory.status} != 'cancelled'`,
        ),
      );

    const existingReservations: ExistingReservation[] = dayReservations.map((r) => ({
      startTime: r.startTime,
      endTime: r.endTime,
      instructorId: r.instructorId,
      aircraftId: r.aircraftId,
      studentId: r.studentId,
    }));

    // Run the 4-layer evaluator
    const result = evaluateAllConstraints(
      {
        studentId: suggestion.studentId,
        proposedStart: suggestion.proposedStart,
        proposedEnd: suggestion.proposedEnd,
        activityTypeId: suggestion.activityTypeId ?? '',
        locationId: suggestion.locationId ?? '',
        instructorId: suggestion.instructorId ?? undefined,
        aircraftId: suggestion.aircraftId ?? undefined,
      },
      existingReservations,
      [], // No FSP availability data at auto-approve time — rely on slot-finder having checked it
      policy,
      undefined,
      undefined,
      'America/Los_Angeles',
    );

    const failedConstraints = result.constraints
      .filter((c) => !c.passed && c.hard)
      .map((c) => `[${c.layer}] ${c.constraint}: ${c.details}`);

    return {
      feasible: result.feasible,
      failedConstraints,
      layerSummary: result.layerSummary,
    };
  }
}
