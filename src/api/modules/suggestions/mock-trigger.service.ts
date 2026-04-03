/**
 * Mock Queue Trigger Service
 *
 * Simulates a schedule event (cancellation opening) using real data from the
 * database — real students, instructors, aircraft, policies — then runs the
 * real ranking algorithm and enqueues AI enrichment jobs.
 *
 * This lets us observe the full suggestion + AI enrichment pipeline without
 * needing live FSP users or a valid fspToken.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { db } from '../../../db/index.js';
import { students } from '../../../db/schema/students.js';
import { instructors } from '../../../db/schema/instructors.js';
import { aircraft } from '../../../db/schema/aircraft.js';
import { activityTypes } from '../../../db/schema/activity-types.js';
import { schedulingPolicies } from '../../../db/schema/scheduling-policies.js';
import { studentInsights } from '../../../db/schema/student-insights.js';
import { reservationHistory } from '../../../db/schema/reservation-history.js';
import { suggestions } from '../../../db/schema/suggestions.js';
import { auditEvents } from '../../../db/schema/audit-events.js';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import {
  rankWaitlistCandidates,
  DEFAULT_RANKING_WEIGHTS,
  type RankingInput,
  type RankingWeights,
} from '../../../core/ranking/waitlist-ranker.js';
import { buildRationale } from '../../../core/scheduling/rationale-builder.js';
import type { ConstraintResult } from '../../../core/scheduling/constraint-evaluator.js';
import type { AiEnrichPayload } from '../../../worker/jobs/ai-enrich-suggestion.job.js';

@Injectable()
export class MockTriggerService {
  private readonly logger = new Logger(MockTriggerService.name);

  constructor(@InjectQueue('ai-enrich-suggestion') private readonly aiEnrichQueue: Queue) {}

  /**
   * Generate mock suggestions from real DB data and enqueue AI enrichment.
   *
   * Flow:
   * 1. Load real entities (students, instructors, aircraft, activity types, policy)
   * 2. Build ranking inputs from student data + reservation history
   * 3. Run rankWaitlistCandidates() with real weights
   * 4. Build deterministic rationale for top N candidates
   * 5. Insert pending suggestions with shared groupId
   * 6. Enqueue ai-enrich-suggestion jobs
   */
  async trigger(
    operatorId: number,
    userId: string,
  ): Promise<{ suggestionIds: string[]; count: number }> {
    // ── 1. Load real entities ──────────────────────────────────────────────
    const [studentRows, instructorRows, aircraftRows, activityTypeRows, policyRows] =
      await Promise.all([
        db.select().from(students).where(eq(students.operatorId, operatorId)),
        db.select().from(instructors).where(eq(instructors.operatorId, operatorId)),
        db.select().from(aircraft).where(eq(aircraft.operatorId, operatorId)),
        db.select().from(activityTypes).where(eq(activityTypes.operatorId, operatorId)),
        db.select().from(schedulingPolicies).where(eq(schedulingPolicies.operatorId, operatorId)),
      ]);

    if (studentRows.length === 0) {
      throw new Error(`No students found for operator ${operatorId}`);
    }
    if (instructorRows.length === 0) {
      throw new Error(`No instructors found for operator ${operatorId}`);
    }
    if (aircraftRows.length === 0) {
      throw new Error(`No aircraft found for operator ${operatorId}`);
    }

    const policy = policyRows[0];
    const maxSuggestions = policy?.rescheduleAlternativesCount ?? 5;
    const ttlHours = policy?.suggestionTtlHours ?? 24;

    // ── 2. Load student insights + last flight data ────────────────────────
    const insightRows = await db
      .select()
      .from(studentInsights)
      .where(eq(studentInsights.operatorId, operatorId));
    const insightMap = new Map(insightRows.map((i) => [i.studentId, i]));

    // Get most recent completed reservation per student for timeSinceLastFlight
    const now = new Date();
    const lastFlightMap = new Map<string, Date>();

    for (const stu of studentRows) {
      const [lastRes] = await db
        .select({ endTime: reservationHistory.endTime })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.studentId, stu.id),
            eq(reservationHistory.status, 'completed'),
          ),
        )
        .orderBy(desc(reservationHistory.endTime))
        .limit(1);

      if (lastRes) {
        lastFlightMap.set(stu.id, lastRes.endTime);
      }
    }

    // ── 3. Build ranking inputs ────────────────────────────────────────────
    const rankingInputs: RankingInput[] = studentRows.map((stu) => {
      const insight = insightMap.get(stu.id);
      const lastFlight = lastFlightMap.get(stu.id);

      // Hours since last flight — use insight or reservation history
      let timeSinceLastFlight = 168; // default 7 days in hours
      if (insight?.lastFlightDate) {
        timeSinceLastFlight = (now.getTime() - insight.lastFlightDate.getTime()) / (1000 * 60 * 60);
      } else if (lastFlight) {
        timeSinceLastFlight = (now.getTime() - lastFlight.getTime()) / (1000 * 60 * 60);
      }

      // Hours until next flight — use insight data
      let timeUntilNextFlight: number | null = null;
      if (insight?.nextFlightDate) {
        const diff = (insight.nextFlightDate.getTime() - now.getTime()) / (1000 * 60 * 60);
        timeUntilNextFlight = diff > 0 ? diff : null;
      }

      return {
        studentId: stu.id,
        timeSinceLastFlight,
        timeUntilNextFlight,
        totalHours: Number(stu.totalFlightHours),
        customFactors: {},
      };
    });

    // ── 4. Run ranking algorithm ───────────────────────────────────────────
    const weights: RankingWeights = {
      ...DEFAULT_RANKING_WEIGHTS,
      ...((policy?.waitlistWeights as Partial<RankingWeights>) ?? {}),
    };
    const ranked = rankWaitlistCandidates(rankingInputs, weights);
    const topCandidates = ranked.slice(0, Math.min(maxSuggestions, ranked.length));

    // ── 5. Pick random instructor + aircraft for the opening ───────────────
    const activeInstructors = instructorRows.filter((i) => i.isActive);
    const activeAircraft = aircraftRows.filter((a) => a.isActive && !a.isSimulator);
    const activeActivityTypes = activityTypeRows.filter((a) => a.isActive);

    const openingInstructor =
      activeInstructors[Math.floor(Math.random() * activeInstructors.length)]!;
    const openingAircraft = activeAircraft[Math.floor(Math.random() * activeAircraft.length)]!;
    const openingActivity =
      activeActivityTypes.length > 0
        ? activeActivityTypes[Math.floor(Math.random() * activeActivityTypes.length)]!
        : null;

    // Mock opening: tomorrow 10:00-12:00 local time
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const proposedStart = tomorrow;
    const proposedEnd = new Date(tomorrow);
    proposedEnd.setHours(12, 0, 0, 0);

    const groupId = randomUUID();
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
    const locationId = 'loc-001'; // Default location

    // ── 6. Build rationale + insert suggestions ────────────────────────────
    const suggestionIds: string[] = [];

    for (const candidate of topCandidates) {
      // Build mock constraint results (all pass in mock mode)
      const constraintResults: ConstraintResult[] = [
        {
          passed: true,
          constraint: 'student_availability',
          details: `Student ${candidate.studentId} assumed available (mock)`,
          layer: 'operator',
          hard: true,
        },
        {
          passed: true,
          constraint: 'instructor_availability',
          details: `Instructor ${openingInstructor.id} assumed available (mock)`,
          layer: 'operator',
          hard: true,
        },
        {
          passed: true,
          constraint: 'daylight_hours',
          details: 'Proposed time 10:00-12:00 is within daylight hours (mock)',
          layer: 'regulatory',
          hard: true,
        },
        {
          passed: true,
          constraint: 'activity_type',
          details: openingActivity
            ? `Activity type ${openingActivity.name} specified`
            : 'No activity type (mock)',
          layer: 'operator',
          hard: true,
        },
      ];

      // Policy notes based on real operator policy
      const policyNotes: string[] = [];
      if (policy) {
        policyNotes.push(`TTL: ${ttlHours}h`);
        policyNotes.push(
          `Search window: ${policy.searchWindowInitialDays}-${policy.searchWindowMaxDays}d`,
        );
        policyNotes.push(`Max alternatives: ${maxSuggestions}`);
      } else {
        policyNotes.push('Using default policy settings');
      }

      // Add insight-based policy notes
      const insight = insightMap.get(candidate.studentId);
      if (insight?.isAtRisk) {
        policyNotes.push(`At-risk student: ${insight.riskReason ?? 'flagged for attention'}`);
      }
      if (insight?.isInactive) {
        policyNotes.push('Student flagged as inactive — re-engagement opportunity');
      }
      if (insight?.isCheckrideReady) {
        policyNotes.push('Student is checkride-ready — high priority');
      }

      const rationale = buildRationale({
        rankingBreakdown: candidate.breakdown,
        constraintResults,
        policyMatches: policyNotes,
        suggestionType: 'waitlist',
      });

      // Insert the suggestion
      const [inserted] = await db
        .insert(suggestions)
        .values({
          operatorId,
          type: 'waitlist',
          status: 'pending',
          locationId,
          studentId: candidate.studentId,
          instructorId: openingInstructor.id,
          aircraftId: openingAircraft.id,
          activityTypeId: openingActivity?.id ?? null,
          proposedStart,
          proposedEnd,
          rankingScore: candidate.score.toFixed(4),
          rationale,
          groupId,
          expiresAt,
        })
        .returning({ id: suggestions.id });

      if (inserted) {
        suggestionIds.push(inserted.id);
      }
    }

    // ── 7. Audit event ─────────────────────────────────────────────────────
    await db.insert(auditEvents).values({
      operatorId,
      eventType: 'mock_trigger',
      entityType: 'suggestion',
      actorId: userId,
      data: {
        groupId,
        suggestionCount: suggestionIds.length,
        candidatesRanked: ranked.length,
        instructor: openingInstructor.id,
        aircraft: openingAircraft.id,
        activityType: openingActivity?.id ?? null,
        proposedStart: proposedStart.toISOString(),
        proposedEnd: proposedEnd.toISOString(),
      },
    });

    // ── 8. Enqueue AI enrichment jobs ──────────────────────────────────────
    for (const id of suggestionIds) {
      const payload: AiEnrichPayload = { suggestionId: id, operatorId };
      await this.aiEnrichQueue.add('ai-enrich-suggestion', payload, {
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
      });
    }

    this.logger.log(
      `Mock trigger: created ${suggestionIds.length} suggestions for operator ${operatorId} ` +
        `(group ${groupId.slice(0, 8)}..., AI enrichment queued)`,
    );

    return { suggestionIds, count: suggestionIds.length };
  }
}
