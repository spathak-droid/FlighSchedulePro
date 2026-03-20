/**
 * BullMQ processor: generate-suggestions
 *
 * Triggered when a schedule change is detected. Handles:
 *
 * T076 (Reschedule): When a cancellation is detected, find alternative slots
 *   for the cancelled student using progressive search window expansion.
 *
 * T077 (Concurrent waitlist + reschedule): When a cancellation occurs, BOTH
 *   the reschedule pipeline (for the cancelled student) and the waitlist
 *   pipeline (for other eligible students) run independently and in parallel.
 *
 * T090 (Next-lesson): When a lesson completion is detected or a periodic check
 *   finds students needing scheduling, generate suggestions for the next
 *   required training event in their enrollment.
 *
 * Waitlist pipeline:
 *   1. Fetches eligible students from FSP
 *   2. Gets student availability
 *   3. Runs the waitlist ranking algorithm
 *   4. Evaluates constraints for top candidates
 *   5. Builds a rationale
 *   6. Creates suggestion records in the DB with TTL from the operator's policy
 *   7. Groups related suggestions under a shared groupId
 */

import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { db } from '../../db/index.js';
import { suggestions } from '../../db/schema/suggestions.js';
import { schedulingPolicies } from '../../db/schema/scheduling-policies.js';
import { operators } from '../../db/schema/operators.js';
import { auditEvents } from '../../db/schema/audit-events.js';
import { eq } from 'drizzle-orm';
import { FspTrainingService } from '../../api/fsp/fsp-training.service.js';
import { FspResourceService } from '../../api/fsp/fsp-resource.service.js';
import { FspScheduleService } from '../../api/fsp/fsp-schedule.service.js';
import { ResourceLookupService } from '../../api/modules/resources/resource-lookup.service.js';
import {
  rankWaitlistCandidates,
  DEFAULT_RANKING_WEIGHTS,
} from '../../core/ranking/waitlist-ranker.js';
import type { RankingInput, RankingWeights } from '../../core/ranking/waitlist-ranker.js';
import { evaluateConstraints } from '../../core/scheduling/constraint-evaluator.js';
import { buildRationale } from '../../core/scheduling/rationale-builder.js';
import {
  detectCancellations,
  filterStudentCancellations,
} from '../../core/scheduling/cancellation-detector.js';
import { findAvailableSlots } from '../../core/scheduling/slot-finder.js';
import type { SlotFinderConfig, FoundSlot } from '../../core/scheduling/slot-finder.js';
import {
  determineNextEvent,
  isEnrollmentComplete,
  getProgressPercentage,
} from '../../core/scheduling/enrollment-analyzer.js';
import type { NextRequiredEvent } from '../../core/scheduling/enrollment-analyzer.js';
import { toFspLocalTime } from '../../core/utils/time.js';
import type { ScheduleChangePayload, NextLessonPayload } from './poll-schedule.job.js';
import type {
  FspScheduleEvent,
  FspAvailability,
  FspCivilTwilight,
  FspEnrollmentProgress,
  FspSchedulableEventsRequest,
} from '../../api/fsp/fsp.types.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of suggestion candidates to evaluate per opening. */
const MAX_CANDIDATES_PER_OPENING = 10;

/** Default number of top candidates to create suggestions for per opening. */
const DEFAULT_TOP_CANDIDATES = 5;

/** Default max next-lesson suggestion slots to generate per student. */
const DEFAULT_NEXT_LESSON_MAX_SLOTS = 5;

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor('generate-suggestions')
export class GenerateSuggestionsJob extends WorkerHost {
  private readonly logger = new Logger(GenerateSuggestionsJob.name);

  constructor(
    private readonly fspTrainingService: FspTrainingService,
    private readonly fspResourceService: FspResourceService,
    private readonly fspScheduleService: FspScheduleService,
    private readonly resourceLookup: ResourceLookupService,
    @InjectQueue('ai-enrich-suggestion') private readonly aiEnrichQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<ScheduleChangePayload | NextLessonPayload>): Promise<void> {
    const { operatorId, detectedAt } = job.data;

    // ── T090: Route to next-lesson pipeline if type is 'next_lesson' ────
    if ('type' in job.data && job.data.type === 'next_lesson') {
      await this.processNextLesson(job as Job<NextLessonPayload>);
      return;
    }

    // ── Standard pipeline (waitlist + reschedule) ────────────────────────

    const schedulePayload = job.data as ScheduleChangePayload;

    this.logger.log(
      `Generate-suggestions job started for operator ${operatorId} ` +
        `(jobId=${job.id}, detectedAt=${detectedAt})`,
    );

    try {
      // Get operator's FSP token
      const [op] = await db
        .select({ fspToken: operators.fspToken })
        .from(operators)
        .where(eq(operators.id, operatorId))
        .limit(1);

      if (!op?.fspToken) {
        this.logger.warn(`Operator ${operatorId} has no FSP token — aborting`);
        return;
      }

      const token = op.fspToken;

      // Get operator's scheduling policy
      const [policy] = await db
        .select()
        .from(schedulingPolicies)
        .where(eq(schedulingPolicies.operatorId, operatorId))
        .limit(1);

      const ttlHours = policy?.suggestionTtlHours ?? 24;
      const searchWindowDays = policy?.searchWindowInitialDays ?? 7;

      // Build ranking weights from policy
      const weights = this.buildWeights(policy?.waitlistWeights as Record<string, number> | null);

      // Determine schedule openings to fill.
      // If openings were provided in the job data, use them.
      // Otherwise, scan the current schedule for gaps.
      let openings = schedulePayload.openings;

      if (!openings || openings.length === 0) {
        // Scan current schedule for available slots
        openings = await this.scanForOpenings(operatorId, token, searchWindowDays);
      }

      if (openings.length === 0) {
        this.logger.log(`No openings found for operator ${operatorId} — nothing to suggest`);
        return;
      }

      this.logger.log(`Processing ${openings.length} openings for operator ${operatorId}`);

      // Fetch all students once for this operator
      const students = await this.fspTrainingService.getStudents(operatorId, token);

      if (students.length === 0) {
        this.logger.warn(`No students found for operator ${operatorId} — aborting`);
        return;
      }

      // Get locations for civil twilight lookups
      const locations = await this.fspResourceService.getLocations(operatorId, token);

      // Assign a shared groupId when multiple openings are processed simultaneously
      const groupId = openings.length > 1 ? randomUUID() : null;

      let totalSuggestionsCreated = 0;

      // ── T077: Concurrent waitlist + reschedule pipelines ─────────────────
      // For cancellation openings, run BOTH pipelines in parallel:
      //   - Reschedule: find alternatives for the cancelled student
      //   - Waitlist: find other eligible students for the now-open slot
      // For gap openings, only the waitlist pipeline runs.

      // Enrich openings: resolve name-based IDs from DB
      for (const opening of openings) {
        if (opening.type === 'cancellation' && opening.previousReservation) {
          const prev = opening.previousReservation;
          await this.enrichPreviousReservation(operatorId, prev, opening);
        }
      }

      const concurrentTasks: Promise<number>[] = [];

      for (const opening of openings) {
        if (opening.type === 'cancellation' && opening.previousReservation) {
          // T076: Reschedule pipeline for the cancelled student
          concurrentTasks.push(
            this.processReschedule(operatorId, token, opening, policy, ttlHours).catch((error) => {
              const msg = error instanceof Error ? error.message : String(error);
              this.logger.error(
                `Reschedule pipeline failed for opening ${opening.start}-${opening.end}: ${msg}`,
              );
              return 0;
            }),
          );
        }

        // Waitlist pipeline runs for ALL openings (both cancellation and gap)
        concurrentTasks.push(
          this.processOpening(
            operatorId,
            token,
            opening,
            students,
            locations,
            weights,
            ttlHours,
            groupId,
          ).catch((error) => {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(
              `Waitlist pipeline failed for opening ${opening.start}-${opening.end}: ${msg}`,
            );
            return 0;
          }),
        );
      }

      // Await all concurrent pipelines
      const results = await Promise.all(concurrentTasks);
      totalSuggestionsCreated = results.reduce((sum, n) => sum + n, 0);

      // Audit log — non-fatal: suggestions are already created in the DB,
      // so a failed audit insert should not cause a job retry
      try {
        await db.insert(auditEvents).values({
          operatorId,
          eventType: 'suggestion.created',
          entityType: 'suggestion',
          data: {
            openingsProcessed: openings.length,
            suggestionsCreated: totalSuggestionsCreated,
            groupId,
            detectedAt,
          },
        });
      } catch (auditErr) {
        this.logger.error(
          `Failed to record suggestion audit event: ${auditErr instanceof Error ? auditErr.message : String(auditErr)}`,
        );
      }

      this.logger.log(
        `Generate-suggestions completed for operator ${operatorId}: ` +
          `${totalSuggestionsCreated} suggestions from ${openings.length} openings`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Generate-suggestions failed for operator ${operatorId}: ${msg}`);
      throw error;
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private buildWeights(policyWeights: Record<string, number> | null): RankingWeights {
    if (!policyWeights) return DEFAULT_RANKING_WEIGHTS;

    return {
      timeSinceLastFlight: policyWeights['waitTime'] ?? DEFAULT_RANKING_WEIGHTS.timeSinceLastFlight,
      timeUntilNextFlight:
        policyWeights['studentProgress'] ?? DEFAULT_RANKING_WEIGHTS.timeUntilNextFlight,
      totalHours: policyWeights['instructorPreference'] ?? DEFAULT_RANKING_WEIGHTS.totalHours,
      custom: Object.entries(policyWeights)
        .filter(([key]) => !['waitTime', 'studentProgress', 'instructorPreference'].includes(key))
        .reduce(
          (acc, [key, value]) => {
            acc[key] = value;
            return acc;
          },
          {} as Record<string, number>,
        ),
    };
  }

  /**
   * Scan the current schedule for gaps and produce openings.
   * This is a fallback when the poll-schedule job did not include specific openings.
   */
  private async scanForOpenings(
    operatorId: number,
    token: string,
    searchWindowDays: number,
  ): Promise<ScheduleChangePayload['openings']> {
    const now = new Date();
    const endDate = new Date(now.getTime() + searchWindowDays * 24 * 60 * 60 * 1000);

    const scheduleResponse = await this.fspScheduleService.getSchedule(operatorId, token, {
      start: toFspLocalTime(now),
      end: toFspLocalTime(endDate),
      locationIds: [],
    });

    const events: FspScheduleEvent[] = scheduleResponse.results?.events ?? [];

    if (events.length < 2) return [];

    // Sort events by start time
    const sorted = [...events].sort((a, b) => a.Start.localeCompare(b.Start));

    const openings: ScheduleChangePayload['openings'] = [];

    // Find gaps between consecutive events
    for (let i = 0; i < sorted.length - 1; i++) {
      const currentEnd = sorted[i]!.End;
      const nextStart = sorted[i + 1]!.Start;

      if (currentEnd < nextStart) {
        const gapStartDate = new Date(
          currentEnd.includes(':') && currentEnd.split(':').length === 2
            ? `${currentEnd}:00`
            : currentEnd,
        );
        const gapEndDate = new Date(
          nextStart.includes(':') && nextStart.split(':').length === 2
            ? `${nextStart}:00`
            : nextStart,
        );

        const durationMin = (gapEndDate.getTime() - gapStartDate.getTime()) / 60_000;

        // Only report gaps of at least 60 minutes (realistic booking slot)
        if (durationMin >= 60) {
          openings.push({
            start: currentEnd,
            end: nextStart,
            locationId: '',
            type: 'gap',
          });
        }
      }
    }

    return openings;
  }

  /**
   * Resolve name-based placeholders in a cancelled reservation to real DB IDs.
   */
  private async enrichPreviousReservation(
    operatorId: number,
    prev: NonNullable<ScheduleChangePayload['openings'][number]['previousReservation']>,
    opening: ScheduleChangePayload['openings'][number],
  ): Promise<void> {
    // Resolve studentId from name if it looks like a name (not an ID)
    if (prev.studentId && !prev.studentId.startsWith('stu-')) {
      const studentName = prev.studentName || prev.studentId;
      const resolvedId = await this.resourceLookup.getStudentByName(operatorId, studentName);
      if (resolvedId) {
        prev.studentName = prev.studentId;
        prev.studentId = resolvedId;
      }
    }

    // Resolve instructorId from name
    if (!prev.instructorId && prev.instructorName) {
      const resolvedId = await this.resourceLookup.getInstructorByName(
        operatorId,
        prev.instructorName,
      );
      if (resolvedId) prev.instructorId = resolvedId;
    }

    // Resolve aircraftId from registration/name
    if (!prev.aircraftId && prev.aircraftName) {
      const resolvedId = await this.resourceLookup.getAircraftByRegistration(
        operatorId,
        prev.aircraftName,
      );
      if (resolvedId) prev.aircraftId = resolvedId;
    }

    // Resolve activityTypeId from event title (stored in activityTypeId field by detector)
    if (prev.activityTypeId && !prev.activityTypeId.startsWith('at-')) {
      const title = prev.activityTypeId;
      const resolvedId = await this.resourceLookup.getActivityTypeByName(operatorId, title);
      if (resolvedId) {
        prev.activityTypeId = resolvedId;
      } else {
        prev.activityTypeId = '';
      }
    }
  }

  /**
   * Process a single schedule opening: rank candidates, evaluate constraints,
   * and create suggestion records.
   */
  private async processOpening(
    operatorId: number,
    token: string,
    opening: ScheduleChangePayload['openings'][number],
    students: Array<{ id: string; firstName: string; lastName: string }>,
    locations: Array<{ id: string; timeZone: string }>,
    weights: RankingWeights,
    ttlHours: number,
    groupId: string | null,
  ): Promise<number> {
    const proposedStart = new Date(
      opening.start.includes(':') && opening.start.split(':').length === 2
        ? `${opening.start}:00`
        : opening.start,
    );
    const proposedEnd = new Date(
      opening.end.includes(':') && opening.end.split(':').length === 2
        ? `${opening.end}:00`
        : opening.end,
    );

    // Build ranking inputs for each student from DB flight history
    const now = new Date();
    const candidateStudents = students.slice(0, MAX_CANDIDATES_PER_OPENING);
    const flightStatsMap = await this.resourceLookup.getBatchStudentFlightStats(
      operatorId,
      candidateStudents.map((s) => s.id),
    );

    const rankingInputs: RankingInput[] = candidateStudents.map((s) => {
      const stats = flightStatsMap.get(s.id);
      return {
        studentId: s.id,
        timeSinceLastFlight: stats?.timeSinceLastFlight ?? 999,
        timeUntilNextFlight: stats?.timeUntilNextFlight ?? null,
        totalHours: stats?.totalHours ?? 0,
        customFactors: {},
      };
    });

    // Rank candidates
    const ranked = rankWaitlistCandidates(rankingInputs, weights);

    if (ranked.length === 0) return 0;

    // Take top candidates
    const topCandidates = ranked.slice(0, DEFAULT_TOP_CANDIDATES);

    // Fetch availability for top candidates
    let availability: FspAvailability[] = [];
    try {
      const studentIds = topCandidates.map((c) => c.studentId);
      availability = await this.fspResourceService.getAvailability(operatorId, token, {
        userGuidIds: studentIds,
        startAtUtc: toFspLocalTime(proposedStart),
        endAtUtc: toFspLocalTime(proposedEnd),
      });
    } catch (error) {
      this.logger.warn(
        `Could not fetch availability for operator ${operatorId}: ${error instanceof Error ? error.message : error}`,
      );
    }

    // Fetch civil twilight for daylight constraint
    let twilight: FspCivilTwilight | undefined;
    if (opening.locationId) {
      try {
        twilight = await this.fspResourceService.getCivilTwilight(
          operatorId,
          token,
          opening.locationId,
        );
      } catch {
        // Civil twilight is optional — proceed without it
      }
    }

    // Evaluate constraints and create suggestions for passing candidates
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
    let created = 0;

    // Use a per-opening groupId if there isn't a batch groupId
    const openingGroupId = groupId ?? (topCandidates.length > 1 ? randomUUID() : null);

    for (const candidate of topCandidates) {
      // Evaluate constraints
      const constraintResults = evaluateConstraints(
        {
          studentId: candidate.studentId,
          proposedStart,
          proposedEnd,
          activityTypeId: opening.previousReservation?.activityTypeId ?? '',
          locationId: opening.locationId,
        },
        availability,
        twilight,
      );

      // Build rationale regardless of constraint pass/fail
      const policyMatches: string[] = [];
      if (ttlHours !== 24) {
        policyMatches.push(`Custom TTL: ${ttlHours}h`);
      }
      if (opening.type === 'cancellation') {
        policyMatches.push('Triggered by cancellation detection');
      }

      const rationale = buildRationale({
        rankingBreakdown: candidate.breakdown,
        constraintResults,
        policyMatches,
        suggestionType: 'waitlist',
      });

      // Only create suggestion if all constraints pass
      const allPassed = constraintResults.every((r) => r.passed);

      if (!allPassed) {
        this.logger.debug(
          `Skipping candidate ${candidate.studentId} for opening ` +
            `${opening.start}-${opening.end}: constraints failed`,
        );
        continue;
      }

      // Create suggestion record
      const [inserted] = await db
        .insert(suggestions)
        .values({
          operatorId,
          type: 'waitlist',
          status: 'pending',
          locationId: opening.locationId || 'unknown',
          studentId: candidate.studentId,
          proposedStart: proposedStart,
          proposedEnd: proposedEnd,
          activityTypeId: opening.previousReservation?.activityTypeId ?? null,
          rankingScore: candidate.score.toFixed(4),
          rationale: {
            reason: rationale.summary,
            factors: candidate.breakdown,
            context: {
              inputs: rationale.inputs,
              constraints: rationale.constraints,
              policies: rationale.policies,
              openingType: opening.type,
            },
          },
          groupId: openingGroupId,
          expiresAt,
        })
        .returning({ id: suggestions.id });

      // Enqueue AI enrichment (async, non-blocking)
      if (inserted) {
        await this.aiEnrichQueue
          .add(
            'enrich',
            { suggestionId: inserted.id, operatorId },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            },
          )
          .catch(() => {}); // never fail the main pipeline
      }

      created++;
    }

    return created;
  }

  // ── T076: Reschedule Pipeline ─────────────────────────────────────────────

  /**
   * Process a reschedule for a cancelled reservation:
   * 1. Find alternative slots using progressive search window expansion
   * 2. Rank by instructor/aircraft preference match
   * 3. Create suggestion records with type='reschedule'
   */
  private async processReschedule(
    operatorId: number,
    token: string,
    opening: ScheduleChangePayload['openings'][number],
    policy: typeof schedulingPolicies.$inferSelect | null | undefined,
    ttlHours: number,
  ): Promise<number> {
    if (!opening.previousReservation) return 0;

    const { studentId, activityTypeId } = opening.previousReservation;
    const originalStart = new Date(
      opening.start.includes(':') && opening.start.split(':').length === 2
        ? `${opening.start}:00`
        : opening.start,
    );
    const originalEnd = new Date(
      opening.end.includes(':') && opening.end.split(':').length === 2
        ? `${opening.end}:00`
        : opening.end,
    );
    const durationMinutes = Math.max(
      (originalEnd.getTime() - originalStart.getTime()) / 60_000,
      60,
    );

    this.logger.log(
      `T076: Processing reschedule for student ${studentId} ` +
        `(activity: ${activityTypeId}) in operator ${operatorId}`,
    );

    // Fetch resources for slot finding
    const [instructorsResult, aircraftResult] = await Promise.all([
      this.fspResourceService.getInstructors(operatorId, token),
      this.fspResourceService.getAircraft(operatorId, token),
    ]);

    const maxSlots = policy?.rescheduleAlternativesCount ?? 5;

    const slotConfig: SlotFinderConfig = {
      initialDays: policy?.searchWindowInitialDays ?? 7,
      incrementDays: policy?.searchWindowIncrementDays ?? 7,
      maxDays: policy?.searchWindowMaxDays ?? 28,
      maxSlots,
      activityTypeId,
      locationId: opening.locationId || '1',
      studentId,
      durationMinutes,
    };

    // Find available slots with progressive expansion
    const slots = await findAvailableSlots(
      slotConfig,
      this.fspResourceService,
      this.fspScheduleService,
      instructorsResult,
      aircraftResult,
      operatorId,
      token,
      originalStart,
    );

    if (slots.length === 0) {
      this.logger.log(
        `No reschedule slots found for student ${studentId} in operator ${operatorId}`,
      );
      return 0;
    }

    // Generate a groupId for this set of reschedule suggestions
    const groupId = randomUUID();
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    // Create suggestion records
    const suggestionRecords = slots.map((slot: FoundSlot) => {
      const rationale = buildRationale({
        rankingBreakdown: {
          instructorContinuity: slot.instructorId === slotConfig.instructorId ? 30 : 0,
          aircraftMatch: slot.aircraftId === slotConfig.aircraftId ? 10 : 0,
          timeOfDayMatch: 10,
          baseScore: 50,
        },
        constraintResults: [],
        policyMatches: [
          `Search window: ${slotConfig.initialDays}d initial, ${slotConfig.maxDays}d max`,
          `Reschedule alternatives: ${maxSlots}`,
        ],
        suggestionType: 'reschedule',
      });

      return {
        operatorId,
        type: 'reschedule' as const,
        status: 'pending' as const,
        locationId: opening.locationId || '1',
        studentId,
        instructorId: slot.instructorId,
        aircraftId: slot.aircraftId,
        proposedStart: slot.start,
        proposedEnd: slot.end,
        activityTypeId,
        rankingScore: slot.matchScore.toFixed(4),
        rationale: {
          reason: rationale.summary,
          factors: {
            instructorContinuity: slot.instructorId === slotConfig.instructorId ? 30 : 0,
            aircraftMatch: slot.aircraftId === slotConfig.aircraftId ? 10 : 0,
            timeOfDayMatch: 10,
            baseScore: 50,
          },
          context: {
            originalStart: opening.start,
            originalEnd: opening.end,
            slotMatchScore: slot.matchScore,
            instructorName: slot.instructorName,
            aircraftRegistration: slot.aircraftRegistration,
          },
        },
        groupId,
        expiresAt,
      };
    });

    if (suggestionRecords.length > 0) {
      const insertedReschedules = await db
        .insert(suggestions)
        .values(suggestionRecords)
        .returning({ id: suggestions.id });

      // Enqueue AI enrichment for each reschedule suggestion
      for (const ins of insertedReschedules) {
        await this.aiEnrichQueue
          .add(
            'enrich',
            { suggestionId: ins.id, operatorId },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            },
          )
          .catch(() => {});
      }

      await db.insert(auditEvents).values({
        operatorId,
        eventType: 'suggestion.created',
        entityType: 'suggestion',
        data: {
          type: 'reschedule',
          count: suggestionRecords.length,
          studentId,
          groupId,
          originalStart: opening.start,
          originalEnd: opening.end,
        },
      });

      this.logger.log(
        `T076: Created ${suggestionRecords.length} reschedule suggestions ` +
          `for student ${studentId} (group: ${groupId})`,
      );
    }

    return suggestionRecords.length;
  }

  // ── T090: Next-Lesson Pipeline ──────────────────────────────────────────

  /**
   * Process a next-lesson suggestion for a student who has completed
   * a lesson or has been detected as needing scheduling.
   *
   * Steps:
   * 1. Get student's enrollment progress from FSP
   * 2. Determine next required event via enrollment analyzer
   * 3. If enrollment complete, skip (don't generate suggestions)
   * 4. Find available slots using slot finder (prefer same instructor for continuity)
   * 5. Evaluate constraints
   * 6. Build rationale (include enrollment context: course name, lesson name, progress %)
   * 7. Create suggestion records with type='next_lesson', linked to enrollment/course/lesson
   */
  private async processNextLesson(job: Job<NextLessonPayload>): Promise<void> {
    const { operatorId, studentId, enrollmentId, detectedAt } = job.data;

    this.logger.log(
      `T090: Next-lesson job started for student ${studentId}, ` +
        `enrollment ${enrollmentId}, operator ${operatorId} (jobId=${job.id})`,
    );

    try {
      // Get operator's FSP token
      const [op] = await db
        .select({ fspToken: operators.fspToken })
        .from(operators)
        .where(eq(operators.id, operatorId))
        .limit(1);

      if (!op?.fspToken) {
        this.logger.warn(`Operator ${operatorId} has no FSP token — aborting next-lesson`);
        return;
      }

      const token = op.fspToken;

      // Get operator's scheduling policy
      const [policy] = await db
        .select()
        .from(schedulingPolicies)
        .where(eq(schedulingPolicies.operatorId, operatorId))
        .limit(1);

      const ttlHours = policy?.suggestionTtlHours ?? 24;

      // Step 1: Get enrollment progress from FSP
      const progress: FspEnrollmentProgress = await this.fspTrainingService.getEnrollmentProgress(
        operatorId,
        token,
        enrollmentId,
      );

      // Step 2 & 3: Check if enrollment is complete
      if (isEnrollmentComplete(progress)) {
        this.logger.log(
          `T090: Enrollment ${enrollmentId} for student ${studentId} is fully complete — skipping`,
        );
        return;
      }

      const completionPct = getProgressPercentage(progress);

      // Get schedulable events to find the next required event
      const now = new Date();
      const searchWindowDays = policy?.searchWindowInitialDays ?? 7;
      const endDate = new Date(now.getTime() + searchWindowDays * 24 * 60 * 60 * 1000);

      const schedulableRequest: FspSchedulableEventsRequest = {
        startDate: toFspLocalTime(now),
        endDate: toFspLocalTime(endDate),
        locationId: 0, // 0 = all locations; will be refined below
      };

      const schedulableEvents = await this.fspTrainingService.getSchedulableEvents(
        operatorId,
        token,
        schedulableRequest,
      );

      // Determine the next event using the enrollment analyzer
      const nextEvent = determineNextEvent(progress, schedulableEvents);

      if (!nextEvent) {
        this.logger.log(
          `T090: No next schedulable event found for student ${studentId}, ` +
            `enrollment ${enrollmentId} — may need prerequisites or data refresh`,
        );
        return;
      }

      this.logger.log(
        `T090: Next event for student ${studentId}: ` +
          `${nextEvent.courseName} > ${nextEvent.lessonName} ` +
          `(lesson ${nextEvent.lessonOrder}, ${completionPct}% complete)`,
      );

      // Step 4: Find available slots using slot finder
      // Prefer same instructor for training continuity
      const [instructorsResult, aircraftResult] = await Promise.all([
        this.fspResourceService.getInstructors(operatorId, token),
        this.fspResourceService.getAircraft(operatorId, token),
      ]);

      // Filter instructors and aircraft to those allowed for this event
      const allowedInstructors =
        nextEvent.instructorIds.length > 0
          ? instructorsResult.filter((i) => nextEvent.instructorIds.includes(i.id))
          : instructorsResult;

      const allowedAircraft =
        nextEvent.aircraftIds.length > 0
          ? aircraftResult.filter((a) => nextEvent.aircraftIds.includes(a.id))
          : aircraftResult;

      const maxSlots = policy?.rescheduleAlternativesCount ?? DEFAULT_NEXT_LESSON_MAX_SLOTS;

      const slotConfig: SlotFinderConfig = {
        initialDays: policy?.searchWindowInitialDays ?? 7,
        incrementDays: policy?.searchWindowIncrementDays ?? 7,
        maxDays: policy?.searchWindowMaxDays ?? 28,
        maxSlots,
        activityTypeId: nextEvent.activityTypeId,
        locationId: '1', // Default location; overridden if locationId is available
        studentId,
        // Prefer first instructor in the allowed list for continuity
        instructorId: allowedInstructors[0]?.id,
        // Prefer first aircraft in the allowed list
        aircraftId: allowedAircraft[0]?.id,
        durationMinutes: nextEvent.durationTotal,
      };

      const slots = await findAvailableSlots(
        slotConfig,
        this.fspResourceService,
        this.fspScheduleService,
        allowedInstructors.length > 0 ? allowedInstructors : instructorsResult,
        allowedAircraft.length > 0 ? allowedAircraft : aircraftResult,
        operatorId,
        token,
      );

      if (slots.length === 0) {
        this.logger.log(
          `T090: No available slots found for next lesson of student ${studentId} — ` +
            `searched up to ${slotConfig.maxDays} days`,
        );
        return;
      }

      // Step 5 & 6: Evaluate constraints and build rationale for each slot
      const groupId = slots.length > 1 ? randomUUID() : null;
      const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
      let created = 0;

      for (const slot of slots) {
        // Evaluate constraints
        let availability: FspAvailability[] = [];
        try {
          availability = await this.fspResourceService.getAvailability(operatorId, token, {
            userGuidIds: [studentId, slot.instructorId].filter(Boolean),
            startAtUtc: toFspLocalTime(slot.start),
            endAtUtc: toFspLocalTime(slot.end),
          });
        } catch {
          // Availability fetch is best-effort for constraint checking
        }

        const constraintResults = evaluateConstraints(
          {
            studentId,
            proposedStart: slot.start,
            proposedEnd: slot.end,
            activityTypeId: nextEvent.activityTypeId,
            locationId: slotConfig.locationId,
            instructorId: slot.instructorId,
            aircraftId: slot.aircraftId,
          },
          availability,
        );

        const allPassed = constraintResults.every((r) => r.passed);

        if (!allPassed) {
          this.logger.debug(
            `T090: Skipping slot ${toFspLocalTime(slot.start)} for student ${studentId}: ` +
              `constraints failed`,
          );
          continue;
        }

        // Build rationale with enrollment context
        const policyMatches: string[] = [
          `Course: ${nextEvent.courseName}`,
          `Lesson: ${nextEvent.lessonName} (order ${nextEvent.lessonOrder})`,
          `Enrollment progress: ${completionPct}% (${progress.completedLessons}/${progress.totalLessons} lessons)`,
        ];

        if (nextEvent.instructorRequired) {
          policyMatches.push('Instructor required for this lesson');
        }

        if (nextEvent.flightType === 1) {
          policyMatches.push('Solo flight');
        }

        if (ttlHours !== 24) {
          policyMatches.push(`Custom TTL: ${ttlHours}h`);
        }

        const rationale = buildRationale({
          rankingBreakdown: {
            instructorContinuity: slot.instructorId === slotConfig.instructorId ? 30 : 0,
            aircraftMatch: slot.aircraftId === slotConfig.aircraftId ? 10 : 0,
            timeOfDayMatch: 10,
            enrollmentProgress: completionPct,
            baseScore: 50,
          },
          constraintResults,
          policyMatches,
          suggestionType: 'next_lesson',
        });

        // Step 7: Create suggestion record with enrollment/course/lesson links
        const [insertedNextLesson] = await db
          .insert(suggestions)
          .values({
            operatorId,
            type: 'next_lesson',
            status: 'pending',
            locationId: slotConfig.locationId,
            studentId,
            instructorId: slot.instructorId,
            aircraftId: slot.aircraftId,
            proposedStart: slot.start,
            proposedEnd: slot.end,
            activityTypeId: nextEvent.activityTypeId,
            courseId: nextEvent.courseId,
            lessonId: nextEvent.lessonId,
            enrollmentId: nextEvent.enrollmentId,
            rankingScore: slot.matchScore.toFixed(4),
            rationale: {
              reason: rationale.summary,
              factors: {
                instructorContinuity: slot.instructorId === slotConfig.instructorId ? 30 : 0,
                aircraftMatch: slot.aircraftId === slotConfig.aircraftId ? 10 : 0,
                timeOfDayMatch: 10,
                enrollmentProgress: completionPct,
                baseScore: 50,
              },
              context: {
                inputs: rationale.inputs,
                constraints: rationale.constraints,
                policies: rationale.policies,
                courseName: nextEvent.courseName,
                lessonName: nextEvent.lessonName,
                lessonOrder: nextEvent.lessonOrder,
                completionPercentage: completionPct,
                completedLessons: progress.completedLessons,
                totalLessons: progress.totalLessons,
                instructorName: slot.instructorName,
                aircraftRegistration: slot.aircraftRegistration,
                flightType: nextEvent.flightType,
                routeType: nextEvent.routeType,
                instructorRequired: nextEvent.instructorRequired,
              },
            },
            groupId,
            expiresAt,
          })
          .returning({ id: suggestions.id });

        // Enqueue AI enrichment
        if (insertedNextLesson) {
          await this.aiEnrichQueue
            .add(
              'enrich',
              { suggestionId: insertedNextLesson.id, operatorId },
              {
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 },
              },
            )
            .catch(() => {});
        }

        created++;
      }

      // Audit log
      if (created > 0) {
        await db.insert(auditEvents).values({
          operatorId,
          eventType: 'suggestion.created',
          entityType: 'suggestion',
          data: {
            type: 'next_lesson',
            count: created,
            studentId,
            enrollmentId,
            courseId: nextEvent.courseId,
            courseName: nextEvent.courseName,
            lessonId: nextEvent.lessonId,
            lessonName: nextEvent.lessonName,
            completionPercentage: completionPct,
            groupId,
            detectedAt,
          },
        });
      }

      this.logger.log(
        `T090: Created ${created} next-lesson suggestions for student ${studentId} ` +
          `(${nextEvent.courseName} > ${nextEvent.lessonName}, ${completionPct}% complete)`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `T090: Next-lesson suggestion failed for student ${studentId}, ` +
          `enrollment ${enrollmentId}: ${msg}`,
      );
      throw error;
    }
  }
}
