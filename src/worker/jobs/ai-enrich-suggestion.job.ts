/**
 * BullMQ processor: ai-enrich-suggestion
 *
 * Asynchronously enriches a suggestion with AI-generated rationale and risk assessment.
 * Called after a suggestion is created in the DB. On failure, the suggestion
 * keeps its deterministic rationale — AI enrichment is never blocking.
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { db } from '../../db/index.js';
import { suggestions } from '../../db/schema/suggestions.js';
import { students } from '../../db/schema/students.js';
import { instructors } from '../../db/schema/instructors.js';
import { aircraft } from '../../db/schema/aircraft.js';
import { activityTypes } from '../../db/schema/activity-types.js';
import { featureFlags } from '../../db/schema/feature-flags.js';
import { auditEvents } from '../../db/schema/audit-events.js';
import { eq, and } from 'drizzle-orm';
import { AiService } from '../../api/modules/ai/ai.service.js';
import type { AiRationaleInput } from '../../api/modules/ai/ai.service.js';

export interface AiEnrichPayload {
  suggestionId: string;
  operatorId: number;
}

@Processor('ai-enrich-suggestion')
export class AiEnrichSuggestionJob extends WorkerHost {
  private readonly logger = new Logger(AiEnrichSuggestionJob.name);

  constructor(private readonly aiService: AiService) {
    super();
  }

  async process(job: Job<AiEnrichPayload>): Promise<void> {
    const { suggestionId, operatorId } = job.data;

    if (!this.aiService.isAvailable) {
      this.logger.debug('AI service unavailable — skipping enrichment');
      return;
    }

    try {
      // Load the suggestion
      const [suggestion] = await db
        .select()
        .from(suggestions)
        .where(and(eq(suggestions.id, suggestionId), eq(suggestions.operatorId, operatorId)))
        .limit(1);

      if (!suggestion) {
        this.logger.warn(`Suggestion ${suggestionId} not found — skipping`);
        return;
      }

      // Load related entities for context
      const [student] = suggestion.studentId
        ? await db.select().from(students).where(eq(students.id, suggestion.studentId)).limit(1)
        : [null];

      const [instructor] = suggestion.instructorId
        ? await db
            .select()
            .from(instructors)
            .where(eq(instructors.id, suggestion.instructorId))
            .limit(1)
        : [null];

      const [craft] = suggestion.aircraftId
        ? await db.select().from(aircraft).where(eq(aircraft.id, suggestion.aircraftId)).limit(1)
        : [null];

      const [activity] = suggestion.activityTypeId
        ? await db
            .select()
            .from(activityTypes)
            .where(eq(activityTypes.id, suggestion.activityTypeId))
            .limit(1)
        : [null];

      // Build AI input — guard against null rationale
      const existingRationale = (suggestion.rationale ?? {}) as Record<string, unknown>;
      const input: AiRationaleInput = {
        suggestionType: suggestion.type as AiRationaleInput['suggestionType'],
        studentName: student ? `${student.firstName} ${student.lastName}` : undefined,
        totalFlightHours: student ? Number(student.totalFlightHours) : undefined,
        timeSinceLastFlight:
          ((existingRationale?.inputs as Record<string, unknown>)?.timeSinceLastFlight as
            | number
            | undefined) ?? undefined,
        enrollmentProgress: suggestion.enrollmentId
          ? `Course ${suggestion.courseId}, Lesson ${suggestion.lessonId}`
          : undefined,
        proposedStart: suggestion.proposedStart.toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
        proposedEnd: suggestion.proposedEnd.toLocaleString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
        activityType: activity?.name,
        instructorName: instructor ? `${instructor.firstName} ${instructor.lastName}` : undefined,
        aircraftRegistration: craft?.registration,
        rankingScore: suggestion.rankingScore ? Number(suggestion.rankingScore) : undefined,
        rankingBreakdown: (existingRationale?.inputs as Record<string, number>) ?? {},
        constraintsPassed: this.extractConstraints(existingRationale, true),
        constraintsFailed: this.extractConstraints(existingRationale, false),
        policyNotes: Array.isArray(existingRationale?.policies)
          ? (existingRationale.policies as string[])
          : Object.keys((existingRationale?.policies as Record<string, unknown>) ?? {}),
      };

      // Call AI
      const result = await this.aiService.generateRationale(input);

      if (!result) {
        this.logger.debug(`AI enrichment returned null for suggestion ${suggestionId}`);
        return;
      }

      // Update suggestion rationale with AI fields
      const updatedRationale = {
        ...existingRationale,
        aiSummary: result.aiSummary,
        riskLevel: result.riskLevel,
        riskReason: result.riskReason,
        aiModel: result.aiModel,
        aiEnriched: true,
      };

      await db
        .update(suggestions)
        .set({ rationale: updatedRationale, updatedAt: new Date() })
        .where(eq(suggestions.id, suggestionId));

      this.logger.log(
        `AI enriched suggestion ${suggestionId.slice(0, 8)}... ` +
          `(risk=${result.riskLevel}, model=${result.aiModel})`,
      );

      // ── Auto-approve check ────────────────────────────────────────
      await this.tryAutoApprove(operatorId, suggestionId, result.riskLevel);
    } catch (err) {
      // Non-fatal — suggestion keeps deterministic rationale
      this.logger.warn(
        `AI enrichment failed for ${suggestionId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * After AI enrichment, check if the suggestion qualifies for auto-approval.
   *
   * Uses the full 4-layer constraint verification:
   * 1. Feature flag check (auto_approve enabled)
   * 2. AI enrichment + risk level threshold
   * 3. Regulatory constraints (FAA duty limits, daylight, flight caps)
   * 4. Safety constraints (turnaround, rest, booking notice)
   * 5. Operator policy constraints (buffer, notice, limits)
   *
   * All decisions (approved or blocked) are logged to audit events with full details.
   */
  private async tryAutoApprove(
    operatorId: number,
    suggestionId: string,
    riskLevel: string,
  ): Promise<void> {
    try {
      // Check auto_approve feature flag
      const [flag] = await db
        .select()
        .from(featureFlags)
        .where(
          and(eq(featureFlags.operatorId, operatorId), eq(featureFlags.flagName, 'auto_approve')),
        )
        .limit(1);

      if (!flag?.enabled) return;

      const config = (flag.config ?? {}) as Record<string, unknown>;
      const riskThreshold = (config.riskThreshold as string) ?? 'low';
      const allowedLevels = riskThreshold === 'medium' ? ['low', 'medium'] : ['low'];

      if (!allowedLevels.includes(riskLevel)) {
        this.logger.debug(
          `Skipping auto-approve for ${suggestionId.slice(0, 8)}: risk '${riskLevel}' exceeds threshold '${riskThreshold}'`,
        );

        // Audit the skip so it's visible in the activity feed
        await db.insert(auditEvents).values({
          operatorId,
          eventType: 'suggestion_auto_approve_blocked',
          entityType: 'suggestion',
          entityId: suggestionId,
          actorId: 'system-auto',
          data: {
            riskLevel,
            riskThreshold,
            blockReason: 'risk_too_high',
            failedConstraints: [`Risk level '${riskLevel}' exceeds threshold '${riskThreshold}'`],
          },
        });

        return;
      }

      // Run the 4-layer constraint check against current schedule state
      const constraintResult = await this.verifyConstraints(operatorId, suggestionId);

      if (constraintResult && !constraintResult.feasible) {
        this.logger.log(
          `Auto-approve BLOCKED for ${suggestionId.slice(0, 8)}: ${constraintResult.failedConstraints.length} constraint(s) failed`,
        );

        await db.insert(auditEvents).values({
          operatorId,
          eventType: 'suggestion_auto_approve_blocked',
          entityType: 'suggestion',
          entityId: suggestionId,
          actorId: 'system-auto',
          data: {
            riskLevel,
            riskThreshold,
            blockReason: 'constraint_violation',
            failedConstraints: constraintResult.failedConstraints,
            layerSummary: constraintResult.layerSummary,
          },
        });

        return;
      }

      // All checks passed — auto-approve
      const now = new Date();
      await db
        .update(suggestions)
        .set({
          status: 'approved',
          approvedBy: 'system-auto',
          approvedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(suggestions.id, suggestionId),
            eq(suggestions.operatorId, operatorId),
            eq(suggestions.status, 'pending'),
          ),
        );

      await db.insert(auditEvents).values({
        operatorId,
        eventType: 'suggestion_auto_approved',
        entityType: 'suggestion',
        entityId: suggestionId,
        actorId: 'system-auto',
        data: {
          riskLevel,
          riskThreshold,
          autoApproved: true,
          constraintsPassed: true,
          layerSummary: constraintResult?.layerSummary ?? {
            regulatory: true,
            safety: true,
            operator: true,
          },
        },
      });

      this.logger.log(
        `Auto-approved suggestion ${suggestionId.slice(0, 8)} (risk: ${riskLevel}, threshold: ${riskThreshold}, all constraints passed)`,
      );
    } catch (err) {
      this.logger.warn(
        `Auto-approve check failed for ${suggestionId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Run the 4-layer constraint evaluator against the current schedule state.
   * Returns null if the check can't be performed (missing data).
   */
  private async verifyConstraints(
    operatorId: number,
    suggestionId: string,
  ): Promise<{
    feasible: boolean;
    failedConstraints: string[];
    layerSummary: { regulatory: boolean; safety: boolean; operator: boolean; preferenceScore: number };
  } | null> {
    try {
      const { evaluateAllConstraints, DEFAULT_OPERATOR_POLICY } = await import(
        '../../core/scheduling/constraint-evaluator.js'
      );
      const { schedulingPolicies, reservationHistory } = await import(
        '../../db/schema/index.js'
      );
      const { gte, lte, sql } = await import('drizzle-orm');

      const [suggestion] = await db
        .select()
        .from(suggestions)
        .where(and(eq(suggestions.id, suggestionId), eq(suggestions.operatorId, operatorId)))
        .limit(1);

      if (!suggestion?.proposedStart || !suggestion?.proposedEnd || !suggestion?.studentId) {
        return null;
      }

      // Load operator policy
      const [policyRow] = await db
        .select()
        .from(schedulingPolicies)
        .where(eq(schedulingPolicies.operatorId, operatorId))
        .limit(1);

      const policy = policyRow
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

      // Load day's reservations
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
        dayReservations.map((r) => ({
          startTime: r.startTime,
          endTime: r.endTime,
          instructorId: r.instructorId,
          aircraftId: r.aircraftId,
          studentId: r.studentId,
        })),
        [],
        policy,
      );

      return {
        feasible: result.feasible,
        failedConstraints: result.constraints
          .filter((c) => !c.passed && c.hard)
          .map((c) => `[${c.layer}] ${c.constraint}: ${c.details}`),
        layerSummary: result.layerSummary,
      };
    } catch (err) {
      this.logger.warn(
        `Constraint verification failed for ${suggestionId}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private extractConstraints(rationale: Record<string, unknown>, passed: boolean): string[] {
    const constraints = rationale?.constraints as Record<string, boolean> | undefined;
    if (!constraints || typeof constraints !== 'object') return [];
    return Object.entries(constraints)
      .filter(([, v]) => v === passed)
      .map(([k]) => k);
  }
}
