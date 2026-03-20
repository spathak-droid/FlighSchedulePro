/**
 * Flight School Simulation Engine
 *
 * Generates realistic flight school events using real DB data so every part
 * of the app comes alive: dashboard metrics, approval queue, disruption
 * banners, activity feed, student insights, and AI enrichment.
 *
 * Events are weighted toward the core use case (cancellation → waitlist fill)
 * but also produce weather disruptions, completed flights, no-shows,
 * maintenance alerts, and instructor unavailability.
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
import { disruptionEvents } from '../../../db/schema/disruption-events.js';
import { flightAlerts } from '../../../db/schema/flight-alerts.js';
import { weatherObservations } from '../../../db/schema/weather-observations.js';
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

// ─── Types ──────────────────────────────────────────────────────────────────

type SimEventType =
  | 'cancellation'
  | 'weather'
  | 'completion'
  | 'no_show'
  | 'maintenance'
  | 'instructor_out';

interface SimulationState {
  intervalHandle: ReturnType<typeof setInterval>;
  eventCount: number;
  startedAt: Date;
  lastEventAt: Date | null;
  lastEventType: SimEventType | null;
}

export interface SimulationStatus {
  running: boolean;
  eventCount: number;
  startedAt: string | null;
  lastEventAt: string | null;
  lastEventType: SimEventType | null;
}

// Weighted event distribution — cancellation is the core flow
const EVENT_WEIGHTS: Array<{ type: SimEventType; weight: number }> = [
  { type: 'cancellation', weight: 35 },
  { type: 'completion', weight: 25 },
  { type: 'weather', weight: 15 },
  { type: 'no_show', weight: 10 },
  { type: 'maintenance', weight: 10 },
  { type: 'instructor_out', weight: 5 },
];

const TOTAL_WEIGHT = EVENT_WEIGHTS.reduce((s, e) => s + e.weight, 0);

// Realistic details
const CANCELLATION_REASONS = [
  'Student called in sick',
  'Student has a work conflict',
  'Family emergency',
  'Student requested reschedule',
  'Vehicle breakdown — cannot reach airport',
  'Student feeling unwell before flight',
];

const WEATHER_SCENARIOS = [
  {
    title: 'IFR conditions — low ceiling',
    category: 'IFR',
    visibility: 1.5,
    cloudCover: 95,
    severity: 'critical' as const,
  },
  {
    title: 'MVFR — reduced visibility',
    category: 'MVFR',
    visibility: 4,
    cloudCover: 75,
    severity: 'warning' as const,
  },
  {
    title: 'Thunderstorms in area — ground stop',
    category: 'LIFR',
    visibility: 0.5,
    cloudCover: 100,
    severity: 'grounded' as const,
  },
  {
    title: 'High crosswinds — 25kt gusting 35kt',
    category: 'MVFR',
    visibility: 8,
    cloudCover: 40,
    severity: 'warning' as const,
  },
  {
    title: 'Fog — visibility below minimums',
    category: 'IFR',
    visibility: 0.25,
    cloudCover: 100,
    severity: 'critical' as const,
  },
];

const MAINTENANCE_ISSUES = [
  {
    title: 'Annual inspection due',
    severity: 'warning' as const,
    description: 'Aircraft approaching annual inspection deadline — remove from schedule',
  },
  {
    title: '100-hour inspection required',
    severity: 'critical' as const,
    description:
      'Aircraft has exceeded 100-hour inspection interval — grounded pending maintenance',
  },
  {
    title: 'Oil pressure anomaly reported',
    severity: 'critical' as const,
    description: 'Pilot reported fluctuating oil pressure on last flight — squawk filed',
  },
  {
    title: 'Landing light inoperative',
    severity: 'warning' as const,
    description: 'Landing light failed on preflight — night flights restricted',
  },
  {
    title: 'Alternator warning during flight',
    severity: 'critical' as const,
    description: 'Alternator warning light illuminated in flight — requires inspection',
  },
];

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class SimulationService {
  private readonly logger = new Logger(SimulationService.name);
  private readonly simulations = new Map<number, SimulationState>();

  constructor(@InjectQueue('ai-enrich-suggestion') private readonly aiEnrichQueue: Queue) {}

  /** Start simulation for an operator. Events fire every intervalMs. */
  async start(operatorId: number, intervalMs = 20_000): Promise<{ message: string }> {
    if (this.simulations.has(operatorId)) {
      return { message: 'Simulation already running' };
    }

    // Validate operator has data
    const studentRows = await db.select().from(students).where(eq(students.operatorId, operatorId));
    if (studentRows.length === 0) {
      throw new Error(`No students found for operator ${operatorId} — cannot simulate`);
    }

    // Fire first event immediately, then on interval
    const state: SimulationState = {
      intervalHandle: setInterval(() => {
        this.fireEvent(operatorId).catch((err) => {
          this.logger.error(`Simulation event failed for operator ${operatorId}: ${err.message}`);
        });
      }, intervalMs),
      eventCount: 0,
      startedAt: new Date(),
      lastEventAt: null,
      lastEventType: null,
    };

    this.simulations.set(operatorId, state);
    this.logger.log(`Simulation started for operator ${operatorId} (interval: ${intervalMs}ms)`);

    // Fire immediately
    await this.fireEvent(operatorId);

    return { message: `Simulation started — events every ${Math.round(intervalMs / 1000)}s` };
  }

  /** Stop simulation for an operator. */
  stop(operatorId: number): { message: string } {
    const state = this.simulations.get(operatorId);
    if (!state) {
      return { message: 'No simulation running' };
    }

    clearInterval(state.intervalHandle);
    this.simulations.delete(operatorId);
    this.logger.log(
      `Simulation stopped for operator ${operatorId} (${state.eventCount} events fired)`,
    );

    return { message: `Simulation stopped after ${state.eventCount} events` };
  }

  /** Get simulation status for an operator. */
  getStatus(operatorId: number): SimulationStatus {
    const state = this.simulations.get(operatorId);
    if (!state) {
      return {
        running: false,
        eventCount: 0,
        startedAt: null,
        lastEventAt: null,
        lastEventType: null,
      };
    }
    return {
      running: true,
      eventCount: state.eventCount,
      startedAt: state.startedAt.toISOString(),
      lastEventAt: state.lastEventAt?.toISOString() ?? null,
      lastEventType: state.lastEventType,
    };
  }

  // ─── Event Dispatcher ──────────────────────────────────────────────────

  private async fireEvent(operatorId: number): Promise<void> {
    const eventType = this.pickEventType();
    const state = this.simulations.get(operatorId);

    this.logger.debug(`Firing simulation event: ${eventType} for operator ${operatorId}`);

    try {
      switch (eventType) {
        case 'cancellation':
          await this.simulateCancellation(operatorId);
          break;
        case 'weather':
          await this.simulateWeather(operatorId);
          break;
        case 'completion':
          await this.simulateCompletion(operatorId);
          break;
        case 'no_show':
          await this.simulateNoShow(operatorId);
          break;
        case 'maintenance':
          await this.simulateMaintenance(operatorId);
          break;
        case 'instructor_out':
          await this.simulateInstructorOut(operatorId);
          break;
      }

      if (state) {
        state.eventCount++;
        state.lastEventAt = new Date();
        state.lastEventType = eventType;
      }
    } catch (err) {
      this.logger.warn(`Event ${eventType} failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private pickEventType(): SimEventType {
    let r = Math.random() * TOTAL_WEIGHT;
    for (const e of EVENT_WEIGHTS) {
      r -= e.weight;
      if (r <= 0) return e.type;
    }
    return 'cancellation';
  }

  // ─── Helper: load operator data ────────────────────────────────────────

  private async loadOperatorData(operatorId: number) {
    const [studentRows, instructorRows, aircraftRows, activityTypeRows, policyRows] =
      await Promise.all([
        db.select().from(students).where(eq(students.operatorId, operatorId)),
        db.select().from(instructors).where(eq(instructors.operatorId, operatorId)),
        db.select().from(aircraft).where(eq(aircraft.operatorId, operatorId)),
        db.select().from(activityTypes).where(eq(activityTypes.operatorId, operatorId)),
        db.select().from(schedulingPolicies).where(eq(schedulingPolicies.operatorId, operatorId)),
      ]);

    return {
      students: studentRows,
      instructors: instructorRows.filter((i) => i.isActive),
      aircraft: aircraftRows.filter((a) => a.isActive && !a.isSimulator),
      activityTypes: activityTypeRows.filter((a) => a.isActive),
      policy: policyRows[0] ?? null,
    };
  }

  private pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]!;
  }

  private randomFutureSlot(): { start: Date; end: Date } {
    const now = new Date();
    // Random time in the next 1-3 days
    const daysAhead = 1 + Math.floor(Math.random() * 3);
    const hour = 7 + Math.floor(Math.random() * 10); // 7am - 5pm
    const start = new Date(now);
    start.setDate(start.getDate() + daysAhead);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(hour + 2, 0, 0, 0); // 2-hour blocks
    return { start, end };
  }

  // ─── Event: Cancellation ──────────────────────────────────────────────

  private async simulateCancellation(operatorId: number): Promise<void> {
    const data = await this.loadOperatorData(operatorId);
    if (data.students.length === 0 || data.instructors.length === 0) return;

    const cancelledStudent = this.pick(data.students);
    const instructor = this.pick(data.instructors);
    const ac = data.aircraft.length > 0 ? this.pick(data.aircraft) : null;
    const activity = data.activityTypes.length > 0 ? this.pick(data.activityTypes) : null;
    const reason = this.pick(CANCELLATION_REASONS);
    const slot = this.randomFutureSlot();

    // 1. Create cancelled reservation in history
    await db.insert(reservationHistory).values({
      operatorId,
      studentId: cancelledStudent.id,
      instructorId: instructor.id,
      aircraftId: ac?.id ?? null,
      activityTypeId: activity?.id ?? null,
      locationId: 'loc-001',
      startTime: slot.start,
      endTime: slot.end,
      status: 'cancelled',
    });

    // 2. Audit event — visible in activity feed
    await db.insert(auditEvents).values({
      operatorId,
      eventType: 'flight_cancelled',
      entityType: 'reservation',
      actorId: 'simulation',
      data: {
        studentId: cancelledStudent.id,
        studentName: `${cancelledStudent.firstName} ${cancelledStudent.lastName}`,
        instructorId: instructor.id,
        instructorName: `${instructor.firstName} ${instructor.lastName}`,
        aircraftId: ac?.id,
        aircraftRegistration: ac?.registration,
        reason,
        proposedStart: slot.start.toISOString(),
        proposedEnd: slot.end.toISOString(),
        simulation: true,
      },
    });

    this.logger.log(
      `SIM cancellation: ${cancelledStudent.firstName} ${cancelledStudent.lastName} cancelled ` +
        `${slot.start.toLocaleDateString()} ${slot.start.getHours()}:00 — "${reason}"`,
    );

    // 3. Generate waitlist suggestions to fill the slot
    await this.generateWaitlistSuggestions(
      operatorId,
      data,
      cancelledStudent.id,
      instructor,
      ac,
      activity,
      slot,
      reason,
    );
  }

  /** Core pipeline: rank students and create suggestions for the freed slot. */
  private async generateWaitlistSuggestions(
    operatorId: number,
    data: Awaited<ReturnType<typeof this.loadOperatorData>>,
    cancelledStudentId: string,
    instructor: (typeof data.instructors)[number],
    ac: (typeof data.aircraft)[number] | null,
    activity: (typeof data.activityTypes)[number] | null,
    slot: { start: Date; end: Date },
    cancellationReason: string,
  ): Promise<void> {
    // Load insights for ranking context
    const insightRows = await db
      .select()
      .from(studentInsights)
      .where(eq(studentInsights.operatorId, operatorId));
    const insightMap = new Map(insightRows.map((i) => [i.studentId, i]));

    const now = new Date();

    // Build ranking inputs for all students except the one who cancelled
    const candidates = data.students.filter((s) => s.id !== cancelledStudentId);
    if (candidates.length === 0) return;

    // Get last flight dates from reservation history
    const lastFlightMap = new Map<string, Date>();
    for (const stu of candidates) {
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
      if (lastRes) lastFlightMap.set(stu.id, lastRes.endTime);
    }

    const rankingInputs: RankingInput[] = candidates.map((stu) => {
      const insight = insightMap.get(stu.id);
      const lastFlight = lastFlightMap.get(stu.id);
      let timeSinceLastFlight = 168;
      if (insight?.lastFlightDate) {
        timeSinceLastFlight = (now.getTime() - insight.lastFlightDate.getTime()) / 3_600_000;
      } else if (lastFlight) {
        timeSinceLastFlight = (now.getTime() - lastFlight.getTime()) / 3_600_000;
      }

      let timeUntilNextFlight: number | null = null;
      if (insight?.nextFlightDate) {
        const diff = (insight.nextFlightDate.getTime() - now.getTime()) / 3_600_000;
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

    const weights: RankingWeights = {
      ...DEFAULT_RANKING_WEIGHTS,
      ...((data.policy?.waitlistWeights as Partial<RankingWeights>) ?? {}),
    };

    const ranked = rankWaitlistCandidates(rankingInputs, weights);
    const maxSuggestions = data.policy?.rescheduleAlternativesCount ?? 5;
    const ttlHours = data.policy?.suggestionTtlHours ?? 24;
    const topCandidates = ranked.slice(0, Math.min(maxSuggestions, ranked.length));

    const groupId = randomUUID();
    const expiresAt = new Date(now.getTime() + ttlHours * 3_600_000);
    const suggestionIds: string[] = [];

    const cancelledStudent = data.students.find((s) => s.id === cancelledStudentId);

    for (const candidate of topCandidates) {
      const insight = insightMap.get(candidate.studentId);

      const constraintResults: ConstraintResult[] = [
        {
          passed: true,
          constraint: 'student_availability',
          details: `Student ${candidate.studentId} available for slot`,
        },
        {
          passed: true,
          constraint: 'instructor_availability',
          details: `Instructor ${instructor.firstName} ${instructor.lastName} available`,
        },
        {
          passed: true,
          constraint: 'daylight_hours',
          details: `Slot ${slot.start.getHours()}:00-${slot.end.getHours()}:00 within daylight`,
        },
        {
          passed: true,
          constraint: 'activity_type',
          details: activity ? `Activity: ${activity.name}` : 'General flight training',
        },
      ];

      const policyNotes: string[] = [
        `Triggered by: ${cancelledStudent ? `${cancelledStudent.firstName} ${cancelledStudent.lastName}` : 'Unknown'} cancellation — "${cancellationReason}"`,
        `TTL: ${ttlHours}h`,
        `Alternatives shown: ${maxSuggestions}`,
      ];
      if (insight?.isAtRisk)
        policyNotes.push(`At-risk student: ${insight.riskReason ?? 'needs attention'}`);
      if (insight?.isInactive) policyNotes.push('Inactive student — re-engagement priority');
      if (insight?.isCheckrideReady) policyNotes.push('Checkride-ready — high priority');

      const rationale = buildRationale({
        rankingBreakdown: candidate.breakdown,
        constraintResults,
        policyMatches: policyNotes,
        suggestionType: 'waitlist',
      });

      const [inserted] = await db
        .insert(suggestions)
        .values({
          operatorId,
          type: 'waitlist',
          status: 'pending',
          locationId: 'loc-001',
          studentId: candidate.studentId,
          instructorId: instructor.id,
          aircraftId: ac?.id ?? null,
          activityTypeId: activity?.id ?? null,
          proposedStart: slot.start,
          proposedEnd: slot.end,
          rankingScore: candidate.score.toFixed(4),
          rationale,
          groupId,
          expiresAt,
        })
        .returning({ id: suggestions.id });

      if (inserted) suggestionIds.push(inserted.id);
    }

    // Audit: suggestions created
    await db.insert(auditEvents).values({
      operatorId,
      eventType: 'suggestion_created',
      entityType: 'suggestion',
      actorId: 'simulation',
      data: {
        groupId,
        count: suggestionIds.length,
        trigger: 'cancellation',
        cancelledStudent: cancelledStudentId,
        slot: { start: slot.start.toISOString(), end: slot.end.toISOString() },
        simulation: true,
      },
    });

    // Enqueue AI enrichment
    for (const id of suggestionIds) {
      const payload: AiEnrichPayload = { suggestionId: id, operatorId };
      await this.aiEnrichQueue.add('ai-enrich-suggestion', payload, {
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
      });
    }

    this.logger.log(
      `SIM: ${suggestionIds.length} waitlist suggestions created (group ${groupId.slice(0, 8)})`,
    );
  }

  // ─── Event: Weather ───────────────────────────────────────────────────

  private async simulateWeather(operatorId: number): Promise<void> {
    const data = await this.loadOperatorData(operatorId);
    const scenario = this.pick(WEATHER_SCENARIOS);

    // Affected aircraft (weather grounds everything if severe)
    const affectedAircraft =
      scenario.severity === 'grounded'
        ? data.aircraft.map((a) => a.id)
        : data.aircraft.slice(0, Math.ceil(data.aircraft.length / 2)).map((a) => a.id);

    const affectedStudents = data.students
      .slice(0, Math.ceil(data.students.length / 3))
      .map((s) => s.id);

    // 1. Create disruption event
    await db.insert(disruptionEvents).values({
      operatorId,
      type: 'weather',
      severity: scenario.severity,
      title: scenario.title,
      description: `Flight category: ${scenario.category}. Visibility: ${scenario.visibility} SM. Cloud cover: ${scenario.cloudCover}%.`,
      affectedAircraftIds: affectedAircraft,
      affectedStudentIds: affectedStudents,
      affectedReservationIds: [],
      locationId: 'loc-001',
      isActive: true,
      metadata: { simulation: true, flightCategory: scenario.category },
    });

    // 2. Weather observation
    await db.insert(weatherObservations).values({
      locationId: 'loc-001',
      latitude: '40.639800',
      longitude: '-73.778900',
      observedAt: new Date(),
      visibility: String(scenario.visibility),
      cloudCover: scenario.cloudCover,
      flightCategory: scenario.category,
      windSpeed: scenario.severity === 'grounded' ? '35' : '15',
      windGust: scenario.severity === 'grounded' ? '45' : null,
      windDirection: Math.floor(Math.random() * 360),
      temperature: '15',
    });

    // 3. Audit event
    await db.insert(auditEvents).values({
      operatorId,
      eventType: 'disruption_detected',
      entityType: 'disruption',
      actorId: 'simulation',
      data: {
        type: 'weather',
        title: scenario.title,
        severity: scenario.severity,
        flightCategory: scenario.category,
        affectedAircraftCount: affectedAircraft.length,
        affectedStudentCount: affectedStudents.length,
        simulation: true,
      },
    });

    this.logger.log(
      `SIM weather: ${scenario.title} (${scenario.severity}) — ${affectedAircraft.length} aircraft affected`,
    );
  }

  // ─── Event: Flight Completion ─────────────────────────────────────────

  private async simulateCompletion(operatorId: number): Promise<void> {
    const data = await this.loadOperatorData(operatorId);
    if (data.students.length === 0 || data.instructors.length === 0) return;

    const student = this.pick(data.students);
    const instructor = this.pick(data.instructors);
    const ac = data.aircraft.length > 0 ? this.pick(data.aircraft) : null;
    const activity = data.activityTypes.length > 0 ? this.pick(data.activityTypes) : null;

    // Completed flight was 2-4 hours ago
    const hoursAgo = 2 + Math.random() * 2;
    const endTime = new Date(Date.now() - hoursAgo * 3_600_000);
    const startTime = new Date(endTime.getTime() - 2 * 3_600_000);
    const flightHours = 1.5 + Math.random() * 0.5; // 1.5-2.0 hours

    // 1. Create completed reservation
    await db.insert(reservationHistory).values({
      operatorId,
      studentId: student.id,
      instructorId: instructor.id,
      aircraftId: ac?.id ?? null,
      activityTypeId: activity?.id ?? null,
      locationId: 'loc-001',
      startTime,
      endTime,
      status: 'completed',
    });

    // 2. Update student flight hours
    const newHours = Number(student.totalFlightHours) + flightHours;
    await db
      .update(students)
      .set({ totalFlightHours: newHours.toFixed(1), updatedAt: new Date() })
      .where(eq(students.id, student.id));

    // 3. Update student insights
    await db
      .update(studentInsights)
      .set({
        lastFlightDate: endTime,
        daysSinceLastFlight: 0,
        totalFlightHours: newHours.toFixed(1),
        isInactive: false,
        computedAt: new Date(),
      })
      .where(
        and(eq(studentInsights.operatorId, operatorId), eq(studentInsights.studentId, student.id)),
      );

    // 4. Audit event
    await db.insert(auditEvents).values({
      operatorId,
      eventType: 'flight_completed',
      entityType: 'reservation',
      actorId: 'simulation',
      data: {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        instructorName: `${instructor.firstName} ${instructor.lastName}`,
        aircraftRegistration: ac?.registration,
        activityType: activity?.name,
        flightHours: flightHours.toFixed(1),
        totalHours: newHours.toFixed(1),
        simulation: true,
      },
    });

    this.logger.log(
      `SIM completion: ${student.firstName} ${student.lastName} flew ${flightHours.toFixed(1)}h ` +
        `(total: ${newHours.toFixed(1)}h) with ${instructor.firstName}`,
    );
  }

  // ─── Event: No-Show ───────────────────────────────────────────────────

  private async simulateNoShow(operatorId: number): Promise<void> {
    const data = await this.loadOperatorData(operatorId);
    if (data.students.length === 0) return;

    const student = this.pick(data.students);
    const instructor = data.instructors.length > 0 ? this.pick(data.instructors) : null;
    const ac = data.aircraft.length > 0 ? this.pick(data.aircraft) : null;

    // No-show was earlier today
    const hoursAgo = 1 + Math.random() * 4;
    const startTime = new Date(Date.now() - hoursAgo * 3_600_000);
    const endTime = new Date(startTime.getTime() + 2 * 3_600_000);

    // 1. Create no-show reservation
    await db.insert(reservationHistory).values({
      operatorId,
      studentId: student.id,
      instructorId: instructor?.id ?? null,
      aircraftId: ac?.id ?? null,
      locationId: 'loc-001',
      startTime,
      endTime,
      status: 'no_show',
    });

    // 2. Mark student as at-risk
    await db
      .update(studentInsights)
      .set({
        isAtRisk: true,
        riskReason: `No-show on ${startTime.toLocaleDateString()} — follow up needed`,
        computedAt: new Date(),
      })
      .where(
        and(eq(studentInsights.operatorId, operatorId), eq(studentInsights.studentId, student.id)),
      );

    // 3. Flight alert
    await db.insert(flightAlerts).values({
      operatorId,
      alertType: 'safety',
      severity: 'warning',
      title: `No-show: ${student.firstName} ${student.lastName}`,
      description:
        `Student did not appear for scheduled ${startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} flight. ` +
        `${instructor ? `Instructor ${instructor.firstName} ${instructor.lastName} was waiting.` : ''} ` +
        `Aircraft and instructor time wasted. Recommend follow-up contact.`,
      studentId: student.id,
      instructorId: instructor?.id ?? null,
      aircraftId: ac?.id ?? null,
    });

    // 4. Audit event
    await db.insert(auditEvents).values({
      operatorId,
      eventType: 'student_no_show',
      entityType: 'reservation',
      actorId: 'simulation',
      data: {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        instructorName: instructor ? `${instructor.firstName} ${instructor.lastName}` : null,
        scheduledTime: startTime.toISOString(),
        simulation: true,
      },
    });

    this.logger.log(
      `SIM no-show: ${student.firstName} ${student.lastName} missed ${startTime.toLocaleTimeString()}`,
    );

    // 5. Also generate waitlist suggestions for the freed slot (same as cancellation)
    if (data.instructors.length > 0 && instructor) {
      await this.generateWaitlistSuggestions(
        operatorId,
        data,
        student.id,
        instructor,
        ac,
        data.activityTypes.length > 0 ? this.pick(data.activityTypes) : null,
        { start: startTime, end: endTime },
        `No-show by ${student.firstName} ${student.lastName}`,
      );
    }
  }

  // ─── Event: Maintenance ───────────────────────────────────────────────

  private async simulateMaintenance(operatorId: number): Promise<void> {
    const data = await this.loadOperatorData(operatorId);
    if (data.aircraft.length === 0) return;

    const ac = this.pick(data.aircraft);
    const issue = this.pick(MAINTENANCE_ISSUES);

    // 1. Disruption event
    await db.insert(disruptionEvents).values({
      operatorId,
      type: 'maintenance',
      severity: issue.severity,
      title: `${ac.registration}: ${issue.title}`,
      description: issue.description,
      affectedAircraftIds: [ac.id],
      affectedStudentIds: [],
      affectedReservationIds: [],
      locationId: 'loc-001',
      isActive: true,
      metadata: { simulation: true, aircraftMakeModel: ac.makeModel },
    });

    // 2. Flight alert
    await db.insert(flightAlerts).values({
      operatorId,
      alertType: 'maintenance_due',
      severity: issue.severity === 'critical' ? 'critical' : 'warning',
      title: `${ac.registration} — ${issue.title}`,
      description: issue.description,
      aircraftId: ac.id,
    });

    // 3. Audit event
    await db.insert(auditEvents).values({
      operatorId,
      eventType: 'maintenance_alert',
      entityType: 'aircraft',
      actorId: 'simulation',
      data: {
        aircraftId: ac.id,
        registration: ac.registration,
        makeModel: ac.makeModel,
        issue: issue.title,
        severity: issue.severity,
        simulation: true,
      },
    });

    this.logger.log(`SIM maintenance: ${ac.registration} — ${issue.title} (${issue.severity})`);
  }

  // ─── Event: Instructor Unavailable ────────────────────────────────────

  private async simulateInstructorOut(operatorId: number): Promise<void> {
    const data = await this.loadOperatorData(operatorId);
    if (data.instructors.length === 0) return;

    const instructor = this.pick(data.instructors);
    const reasons = [
      'Called in sick',
      'Family emergency — out for the day',
      'Flight physical appointment',
      'Attending safety seminar',
      'Vehicle trouble — cannot reach airport',
    ];
    const reason = this.pick(reasons);

    // Affected students — random subset
    const affectedStudents = data.students
      .filter(() => Math.random() > 0.5)
      .slice(0, 3)
      .map((s) => s.id);

    // 1. Disruption event
    await db.insert(disruptionEvents).values({
      operatorId,
      type: 'instructor',
      severity: 'warning',
      title: `${instructor.firstName} ${instructor.lastName} unavailable`,
      description: reason,
      affectedAircraftIds: [],
      affectedStudentIds: affectedStudents,
      affectedReservationIds: [],
      locationId: 'loc-001',
      isActive: true,
      metadata: {
        simulation: true,
        instructorId: instructor.id,
        instructorType: instructor.instructorType,
      },
    });

    // 2. Audit event
    await db.insert(auditEvents).values({
      operatorId,
      eventType: 'instructor_unavailable',
      entityType: 'instructor',
      actorId: 'simulation',
      data: {
        instructorId: instructor.id,
        instructorName: `${instructor.firstName} ${instructor.lastName}`,
        reason,
        affectedStudentCount: affectedStudents.length,
        simulation: true,
      },
    });

    this.logger.log(
      `SIM instructor out: ${instructor.firstName} ${instructor.lastName} — "${reason}" ` +
        `(${affectedStudents.length} students affected)`,
    );

    // 3. Generate reschedule suggestions for affected students
    if (affectedStudents.length > 0 && data.instructors.length > 1) {
      const alternateInstructors = data.instructors.filter((i) => i.id !== instructor.id);
      if (alternateInstructors.length === 0) return;

      const altInstructor = this.pick(alternateInstructors);
      const slot = this.randomFutureSlot();
      const ac = data.aircraft.length > 0 ? this.pick(data.aircraft) : null;
      const activity = data.activityTypes.length > 0 ? this.pick(data.activityTypes) : null;

      const groupId = randomUUID();
      const ttlHours = data.policy?.suggestionTtlHours ?? 24;
      const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);

      for (const studentId of affectedStudents) {
        const student = data.students.find((s) => s.id === studentId);
        if (!student) continue;

        const rationale = buildRationale({
          rankingBreakdown: { instructorSwap: 0.4, timePreference: 0.3, totalHours: 0.3 },
          constraintResults: [
            {
              passed: true,
              constraint: 'alternate_instructor',
              details: `Reassigned to ${altInstructor.firstName} ${altInstructor.lastName}`,
            },
            {
              passed: true,
              constraint: 'student_availability',
              details: `${student.firstName} ${student.lastName} available`,
            },
          ],
          policyMatches: [
            `Triggered by: ${instructor.firstName} ${instructor.lastName} unavailable — "${reason}"`,
            `Reassigned to: ${altInstructor.firstName} ${altInstructor.lastName} (${altInstructor.instructorType ?? 'CFI'})`,
          ],
          suggestionType: 'reschedule',
        });

        const [inserted] = await db
          .insert(suggestions)
          .values({
            operatorId,
            type: 'reschedule',
            status: 'pending',
            locationId: 'loc-001',
            studentId,
            instructorId: altInstructor.id,
            aircraftId: ac?.id ?? null,
            activityTypeId: activity?.id ?? null,
            proposedStart: slot.start,
            proposedEnd: slot.end,
            rankingScore: '0.7500',
            rationale,
            groupId,
            expiresAt,
          })
          .returning({ id: suggestions.id });

        if (inserted) {
          const payload: AiEnrichPayload = { suggestionId: inserted.id, operatorId };
          await this.aiEnrichQueue.add('ai-enrich-suggestion', payload, {
            attempts: 2,
            backoff: { type: 'exponential', delay: 3000 },
          });
        }
      }

      await db.insert(auditEvents).values({
        operatorId,
        eventType: 'suggestion_created',
        entityType: 'suggestion',
        actorId: 'simulation',
        data: {
          groupId,
          count: affectedStudents.length,
          trigger: 'instructor_unavailable',
          originalInstructor: `${instructor.firstName} ${instructor.lastName}`,
          reassignedTo: `${altInstructor.firstName} ${altInstructor.lastName}`,
          simulation: true,
        },
      });
    }
  }
}
