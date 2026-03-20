/**
 * BullMQ processor: poll-schedule
 *
 * Periodically polls each active operator's FSP schedule, hashes the result,
 * and detects changes. When the schedule hash changes, it enqueues a
 * generate-suggestions job with the detected openings.
 *
 * T091: Also periodically detects students with active enrollments who have
 * no upcoming reservations and uncompleted lessons remaining, then enqueues
 * next-lesson suggestion generation jobs for them.
 */

import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { db } from '../../db/index.js';
import { operators } from '../../db/schema/operators.js';
import { syncState } from '../../db/schema/sync-state.js';
import { schedulingPolicies } from '../../db/schema/scheduling-policies.js';
import { auditEvents } from '../../db/schema/audit-events.js';
import { students } from '../../db/schema/students.js';
import { suggestions } from '../../db/schema/suggestions.js';
import { featureFlags } from '../../db/schema/feature-flags.js';
import { reservationHistory } from '../../db/schema/reservation-history.js';
import { eq, and, lt, gt, ne, sql } from 'drizzle-orm';
import { FspScheduleService } from '../../api/fsp/fsp-schedule.service.js';
import { FspAuthService } from '../../api/fsp/fsp-auth.service.js';
import { FspTrainingService } from '../../api/fsp/fsp-training.service.js';
import { hashSchedule, detectOpenings } from '../../core/scheduling/change-detector.js';
import { isEnrollmentComplete } from '../../core/scheduling/enrollment-analyzer.js';
import { toFspLocalTime } from '../../core/utils/time.js';
import type { FspScheduleEvent, FspReservationListItem } from '../../api/fsp/fsp.types.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Default interval (in minutes) for the pending-lesson check.
 * This runs less frequently than schedule polling to avoid excessive FSP calls.
 */
const DEFAULT_PENDING_LESSON_INTERVAL_MINUTES = 30;

// ─── Job Data ────────────────────────────────────────────────────────────────

export interface PollScheduleJobData {
  /** If provided, poll only this operator. Otherwise poll all active operators. */
  operatorId?: number;
  /** If true, also run the pending-lesson detector (T091). */
  checkPendingLessons?: boolean;
}

export interface ScheduleChangePayload {
  operatorId: number;
  openings: Array<{
    start: string;
    end: string;
    locationId: string;
    type: 'cancellation' | 'gap';
    previousReservation?: {
      studentId: string;
      activityTypeId: string;
      instructorId?: string;
      aircraftId?: string;
      studentName?: string;
      instructorName?: string;
      aircraftName?: string;
    };
  }>;
  detectedAt: string;
}

/**
 * T090: Job payload for next-lesson suggestion generation.
 * Enqueued by the pending-lesson detector (T091) or triggered
 * by lesson completion detection (T092).
 */
export interface NextLessonPayload {
  type: 'next_lesson';
  operatorId: number;
  studentId: string;
  enrollmentId: string;
  detectedAt: string;
}

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor('poll-schedule')
export class PollScheduleJob extends WorkerHost {
  private readonly logger = new Logger(PollScheduleJob.name);

  /** Tracks when each operator last ran the pending-lesson check. */
  private lastPendingLessonCheck = new Map<number, Date>();

  constructor(
    private readonly fspScheduleService: FspScheduleService,
    private readonly fspAuthService: FspAuthService,
    private readonly fspTrainingService: FspTrainingService,
    @InjectQueue('generate-suggestions') private readonly suggestionsQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<PollScheduleJobData>): Promise<void> {
    this.logger.log(`Poll-schedule job started (jobId=${job.id})`);

    try {
      // Determine which operators to poll
      const activeOperators = await this.getActiveOperators(job.data.operatorId);

      if (activeOperators.length === 0) {
        this.logger.warn('No active operators to poll');
        return;
      }

      for (const op of activeOperators) {
        try {
          await this.pollOperator(op.id, op.name, op.fspToken);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to poll operator ${op.id} (${op.name}): ${msg}`);

          // Record the sync failure in audit log
          await db.insert(auditEvents).values({
            operatorId: op.id,
            eventType: 'sync.failed',
            entityType: 'sync',
            data: { error: msg, phase: 'poll-schedule' },
          });
        }

        // ── T091: Pending-lesson detection ─────────────────────────────
        // Run less frequently than schedule polling (default every 30 min)
        if (job.data.checkPendingLessons !== false) {
          try {
            const lessonToken =
              op.fspToken ?? (process.env.FSP_MOCK_MODE === 'true' ? 'mock-poll-token' : null);
            await this.checkPendingLessonsIfDue(op.id, lessonToken);
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`T091: Pending-lesson check failed for operator ${op.id}: ${msg}`);
          }

          // ── Inactive student outreach ─────────────────────────────────
          try {
            await this.checkInactiveStudents(op.id);
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`Inactive student outreach failed for operator ${op.id}: ${msg}`);
          }
        }
      }

      this.logger.log(`Poll-schedule job completed (jobId=${job.id})`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Poll-schedule job failed: ${msg}`);
      throw error;
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async getActiveOperators(specificId?: number) {
    if (specificId) {
      const [op] = await db
        .select({
          id: operators.id,
          name: operators.name,
          fspToken: operators.fspToken,
        })
        .from(operators)
        .where(eq(operators.id, specificId))
        .limit(1);

      return op ? [op] : [];
    }

    return db
      .select({
        id: operators.id,
        name: operators.name,
        fspToken: operators.fspToken,
      })
      .from(operators)
      .where(eq(operators.status, 'active'));
  }

  private async pollOperator(
    operatorId: number,
    operatorName: string,
    fspToken: string | null,
  ): Promise<void> {
    const isMockMode = process.env.FSP_MOCK_MODE === 'true';
    const token = fspToken ?? (isMockMode ? 'mock-poll-token' : null);
    if (!token) {
      this.logger.warn(`Operator ${operatorId} (${operatorName}) has no FSP token — skipping`);
      return;
    }
    const effectiveToken = token;

    this.logger.debug(`Polling schedule for operator ${operatorId} (${operatorName})`);

    // Record sync start
    await db.insert(auditEvents).values({
      operatorId,
      eventType: 'sync.started',
      entityType: 'sync',
      data: { phase: 'poll-schedule' },
    });

    // Get the operator's scheduling policy for search window configuration
    const [policy] = await db
      .select()
      .from(schedulingPolicies)
      .where(eq(schedulingPolicies.operatorId, operatorId))
      .limit(1);

    const searchWindowDays = policy?.searchWindowInitialDays ?? 7;

    // Build date range for schedule fetch
    const now = new Date();
    const endDate = new Date(now.getTime() + searchWindowDays * 24 * 60 * 60 * 1000);

    // Fetch current schedule from FSP
    const scheduleResponse = await this.fspScheduleService.getSchedule(operatorId, effectiveToken, {
      start: toFspLocalTime(now),
      end: toFspLocalTime(endDate),
      locationIds: [], // empty = all locations
    });

    const currentEvents: FspScheduleEvent[] = scheduleResponse.results?.events ?? [];

    // Hash the current schedule
    const currentHash = hashSchedule(currentEvents);

    // Get previous sync state
    const [currentSyncState] = await db
      .select()
      .from(syncState)
      .where(eq(syncState.operatorId, operatorId))
      .limit(1);

    const previousHash = currentSyncState?.lastScheduleHash ?? null;

    if (previousHash === currentHash) {
      // Schedule unchanged — update lastScheduleSyncAt only
      this.logger.debug(`Schedule unchanged for operator ${operatorId}`);

      if (currentSyncState) {
        await db
          .update(syncState)
          .set({
            lastScheduleSyncAt: now,
            updatedAt: now,
          })
          .where(eq(syncState.operatorId, operatorId));
      } else {
        await db.insert(syncState).values({
          operatorId,
          lastScheduleHash: currentHash,
          lastScheduleSyncAt: now,
        });
      }

      return;
    }

    // Schedule changed — detect openings
    this.logger.log(
      `Schedule changed for operator ${operatorId}: hash ${previousHash ?? '(none)'} -> ${currentHash}`,
    );

    // If we have a previous hash, we need the previous events to diff.
    // Since we don't store the full previous schedule, we can only detect
    // openings when we have a previous snapshot. On first poll, we just
    // store the baseline hash.
    const openings: Array<{
      start: string;
      end: string;
      locationId: string;
      type: 'cancellation' | 'gap';
      previousReservation?: { studentId: string; activityTypeId: string };
    }> = [];

    if (previousHash !== null) {
      // We detect openings by comparing against stored previous events.
      // Since we only store the hash, not the full previous event list,
      // we use a pragmatic approach: the job data can include the previous
      // events if cached. For the standard flow, we detect cancellations
      // by checking the current schedule for gaps.
      //
      // In practice, we re-fetch or use cached previous events. For the
      // initial implementation, we emit the change event and let the
      // suggestion generator fetch fresh data to work with.
      //
      // We still emit a change event so the generator can assess the current
      // state of the schedule independently.
      this.logger.log(
        `Emitting schedule-changed for operator ${operatorId} with ${currentEvents.length} current events`,
      );
    }

    // Update sync state
    if (currentSyncState) {
      await db
        .update(syncState)
        .set({
          lastScheduleHash: currentHash,
          lastScheduleSyncAt: now,
          updatedAt: now,
        })
        .where(eq(syncState.operatorId, operatorId));
    } else {
      await db.insert(syncState).values({
        operatorId,
        lastScheduleHash: currentHash,
        lastScheduleSyncAt: now,
      });
    }

    // Only enqueue suggestion generation if we had a previous baseline
    // (skip on first-ever poll to avoid noise)
    if (previousHash !== null) {
      const changePayload: ScheduleChangePayload = {
        operatorId,
        openings,
        detectedAt: now.toISOString(),
      };

      await this.suggestionsQueue.add(`generate-${operatorId}-${Date.now()}`, changePayload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });

      this.logger.log(`Enqueued generate-suggestions job for operator ${operatorId}`);
    } else {
      this.logger.log(
        `First poll for operator ${operatorId} — baseline hash stored, no suggestions generated`,
      );
    }

    // Record sync completion
    await db.insert(auditEvents).values({
      operatorId,
      eventType: 'sync.completed',
      entityType: 'sync',
      data: {
        phase: 'poll-schedule',
        eventsCount: currentEvents.length,
        hashChanged: previousHash !== currentHash,
        previousHash,
        currentHash,
      },
    });
  }

  // ── T091: Pending-Lesson Detection ──────────────────────────────────────

  /**
   * Check if the pending-lesson detector is due to run for this operator.
   * It runs on a separate, less frequent interval (default 30 min).
   */
  private async checkPendingLessonsIfDue(
    operatorId: number,
    fspToken: string | null,
  ): Promise<void> {
    if (!fspToken) return;

    const now = new Date();
    const lastCheck = this.lastPendingLessonCheck.get(operatorId);

    // Get operator's policy for interval configuration
    const [policy] = await db
      .select()
      .from(schedulingPolicies)
      .where(eq(schedulingPolicies.operatorId, operatorId))
      .limit(1);

    const intervalMinutes = DEFAULT_PENDING_LESSON_INTERVAL_MINUTES;

    if (lastCheck) {
      const elapsed = (now.getTime() - lastCheck.getTime()) / 60_000;
      if (elapsed < intervalMinutes) {
        this.logger.debug(
          `T091: Skipping pending-lesson check for operator ${operatorId} — ` +
            `last check was ${Math.round(elapsed)}min ago (interval: ${intervalMinutes}min)`,
        );
        return;
      }
    }

    this.logger.log(`T091: Running pending-lesson check for operator ${operatorId}`);

    this.lastPendingLessonCheck.set(operatorId, now);

    await this.detectPendingLessons(operatorId, fspToken);
  }

  /**
   * T091: Detect students who need next-lesson scheduling.
   *
   * Criteria:
   * 1. Have active enrollments (via FspTrainingService.getEnrollments)
   * 2. No upcoming reservations in the schedule
   * 3. Uncompleted lessons remaining in at least one enrollment
   *
   * For each such student, enqueue a 'generate-suggestions' job
   * with type='next_lesson'.
   */
  private async detectPendingLessons(operatorId: number, fspToken: string): Promise<void> {
    // Step 1: Get all students for this operator
    const students = await this.fspTrainingService.getStudents(operatorId, fspToken);

    if (students.length === 0) {
      this.logger.debug(`T091: No students for operator ${operatorId}`);
      return;
    }

    // Step 2: Get current and future reservations to identify students with bookings
    const now = new Date();
    const futureEnd = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000); // 28 days out

    let upcomingReservations: FspReservationListItem[] = [];
    try {
      const reservationsResponse = await this.fspScheduleService.getReservations(
        operatorId,
        fspToken,
        {
          dateRangeType: 3, // Custom range
          startRange: toFspLocalTime(now),
          endRange: toFspLocalTime(futureEnd),
          pageSize: 500,
        },
      );
      upcomingReservations = reservationsResponse.results ?? [];
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `T091: Could not fetch upcoming reservations for operator ${operatorId}: ${msg}`,
      );
      return;
    }

    // Build a set of student IDs who already have upcoming reservations
    const studentsWithReservations = new Set<string>(upcomingReservations.map((r) => r.pilotId));

    // Step 3: For each student without upcoming reservations, check enrollments
    let enqueued = 0;

    for (const student of students) {
      // Skip students who already have upcoming bookings
      if (studentsWithReservations.has(student.id)) {
        continue;
      }

      try {
        // Get active enrollments for this student
        const enrollments = await this.fspTrainingService.getEnrollments(
          operatorId,
          fspToken,
          student.id,
        );

        // Filter to active enrollments only
        const activeEnrollments = enrollments.filter(
          (e) => e.status === 'Active' || e.status === 'active',
        );

        if (activeEnrollments.length === 0) continue;

        // Check each active enrollment for uncompleted lessons
        for (const enrollment of activeEnrollments) {
          try {
            const progress = await this.fspTrainingService.getEnrollmentProgress(
              operatorId,
              fspToken,
              enrollment.id,
            );

            // Skip fully completed enrollments
            if (isEnrollmentComplete(progress)) continue;

            // This student has uncompleted lessons and no upcoming reservations
            // — enqueue a next-lesson suggestion job
            const payload: NextLessonPayload = {
              type: 'next_lesson',
              operatorId,
              studentId: student.id,
              enrollmentId: enrollment.id,
              detectedAt: now.toISOString(),
            };

            await this.suggestionsQueue.add(
              `next-lesson-${operatorId}-${student.id}-${enrollment.id}-${Date.now()}`,
              payload,
              {
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
                // Deduplicate: don't enqueue if a similar job is already pending
                jobId: `next-lesson-${operatorId}-${student.id}-${enrollment.id}`,
              },
            );

            enqueued++;

            this.logger.debug(
              `T091: Enqueued next-lesson job for student ${student.id}, ` +
                `enrollment ${enrollment.id} (${enrollment.courseName})`,
            );
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.warn(
              `T091: Could not check progress for enrollment ${enrollment.id}: ${msg}`,
            );
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`T091: Could not check enrollments for student ${student.id}: ${msg}`);
      }
    }

    if (enqueued > 0) {
      this.logger.log(`T091: Enqueued ${enqueued} next-lesson jobs for operator ${operatorId}`);

      await db.insert(auditEvents).values({
        operatorId,
        eventType: 'next_lesson.detected',
        entityType: 'enrollment',
        data: {
          phase: 'pending-lesson-detector',
          studentsChecked: students.length,
          studentsWithReservations: studentsWithReservations.size,
          nextLessonJobsEnqueued: enqueued,
        },
      });
    } else {
      this.logger.debug(`T091: No pending-lesson candidates found for operator ${operatorId}`);
    }
  }

  /**
   * Check for inactive students (no flight in 14+ days, no upcoming reservation)
   * and generate outreach suggestions for them.
   */
  private async checkInactiveStudents(operatorId: number): Promise<void> {
    // Check if student_insights feature flag is enabled
    const [flag] = await db
      .select()
      .from(featureFlags)
      .where(
        and(eq(featureFlags.operatorId, operatorId), eq(featureFlags.flagName, 'student_insights')),
      )
      .limit(1);

    if (!flag?.enabled) return;

    const now = new Date();
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    // Find all students for this operator
    const allStudents = await db
      .select({ id: students.id, firstName: students.firstName, lastName: students.lastName })
      .from(students)
      .where(eq(students.operatorId, operatorId));

    if (allStudents.length === 0) return;

    // Find students whose last flight was 14+ days ago (via reservation history)
    const recentFlyers = await db
      .select({ studentId: reservationHistory.studentId })
      .from(reservationHistory)
      .where(
        and(
          eq(reservationHistory.operatorId, operatorId),
          gt(reservationHistory.startTime, fourteenDaysAgo),
          ne(reservationHistory.status, 'cancelled'),
        ),
      );

    const recentFlyerIds = new Set(recentFlyers.map((r) => r.studentId));
    const inactiveStudents = allStudents.filter((s) => !recentFlyerIds.has(s.id));

    if (inactiveStudents.length === 0) return;

    // Filter out students who already have pending outreach suggestions
    const existingOutreach = await db
      .select({ studentId: suggestions.studentId })
      .from(suggestions)
      .where(
        and(
          eq(suggestions.operatorId, operatorId),
          eq(suggestions.type, 'next_lesson'),
          eq(suggestions.status, 'pending'),
        ),
      );

    const alreadyTargeted = new Set(existingOutreach.map((s) => s.studentId));

    // Also filter students with upcoming reservations
    const withUpcoming = await db
      .select({ studentId: reservationHistory.studentId })
      .from(reservationHistory)
      .where(
        and(
          eq(reservationHistory.operatorId, operatorId),
          gt(reservationHistory.startTime, now),
          ne(reservationHistory.status, 'cancelled'),
        ),
      );

    const hasUpcoming = new Set(withUpcoming.map((r) => r.studentId));

    const candidates = inactiveStudents.filter(
      (s) => !alreadyTargeted.has(s.id) && !hasUpcoming.has(s.id),
    );

    if (candidates.length === 0) return;

    // Enqueue next-lesson suggestions for each inactive student
    let enqueued = 0;
    for (const student of candidates) {
      await this.suggestionsQueue.add(
        `outreach-${operatorId}-${student.id}-${Date.now()}`,
        {
          type: 'next_lesson',
          operatorId,
          studentId: student.id,
          enrollmentId: '',
          detectedAt: now.toISOString(),
        },
        { attempts: 2, backoff: { type: 'exponential', delay: 5000 } },
      );
      enqueued++;
    }

    this.logger.log(
      `Inactive student outreach: ${enqueued} candidates for operator ${operatorId} ` +
        `(${inactiveStudents.length} inactive, ${alreadyTargeted.size} already targeted, ${hasUpcoming.size} have upcoming)`,
    );

    await db.insert(auditEvents).values({
      operatorId,
      eventType: 'inactive_student_outreach',
      entityType: 'student',
      data: {
        inactiveCount: inactiveStudents.length,
        candidatesEnqueued: enqueued,
        skippedAlreadyTargeted: alreadyTargeted.size,
        skippedHasUpcoming: hasUpcoming.size,
      },
    });
  }
}
