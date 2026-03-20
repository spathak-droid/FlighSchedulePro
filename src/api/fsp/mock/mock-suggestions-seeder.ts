import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { db } from '../../../db/index.js';
import {
  suggestions, prospects, auditEvents,
  students, instructors, aircraft, activityTypes, reservationHistory,
  studentInsights, disruptionEvents, cancellationReasons, flightAlerts,
} from '../../../db/schema/index.js';
import { sql, eq, and, desc, gte, lte } from 'drizzle-orm';
import {
  MOCK_OPERATOR_ID, MOCK_ALL_OPERATORS,
  MOCK_STUDENTS_BY_OPERATOR, MOCK_INSTRUCTORS_BY_OPERATOR,
  MOCK_AIRCRAFT_BY_OPERATOR,
} from './mock-data.js';
import { OnboardingService } from '../../modules/auth/onboarding.service.js';
import { FeatureFlagService } from '../../modules/feature-flags/feature-flag.service.js';

/**
 * Seeds the DB with realistic mock data on startup when `FSP_MOCK_MODE=true`.
 *
 * Multi-tenant boot sequence (for each operator):
 * 1. Onboard operator (idempotent — creates operator + policies + templates + sync_state)
 * 2. Seed a prospect for discovery suggestions
 * 3. Seed suggestions spanning various types and statuses
 * 4. Seed audit events for the activity feed
 *
 * Operators seeded: 1001 (SkyWest), 1002 (Bay Area), 1003 (Pacific Coast)
 */
@Injectable()
export class MockSuggestionsSeeder implements OnModuleInit {
  private readonly logger = new Logger('MockSuggestionsSeeder');

  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly featureFlagService: FeatureFlagService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.FSP_MOCK_MODE !== 'true') {
      return;
    }

    try {
      // Onboard ALL operators before inserting any FK-dependent data
      for (const op of MOCK_ALL_OPERATORS) {
        await this.onboardingService.onboardOperator(op.id, op.name);
      }

      // Seed feature flags for all operators (idempotent — skips existing flags)
      for (const op of MOCK_ALL_OPERATORS) {
        await this.featureFlagService.seedDefaultFlags(op.id);
      }

      // Seed resource tables — each is independently idempotent
      await this.seedResources();
      await this.seedStudentInsights();
      await this.seedCancellationReasons();
      await this.seedDisruptionEvents();
      await this.seedFlightAlerts();

      this.logger.log('[MOCK] Checking pending suggestions per operator...');
      const now = new Date();

      // ── Operator 1001: SkyWest Flight Academy (rich dataset) ──────────
      const [pending1001] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(suggestions)
        .where(and(eq(suggestions.operatorId, MOCK_OPERATOR_ID), eq(suggestions.status, 'pending')));

      if ((pending1001?.count ?? 0) === 0) {
        const prospect1001 = await this.seedProspect(MOCK_OPERATOR_ID, 'Jane', 'Smith', 'jane.smith@gmail.com', '(650) 555-0199');
        const rows1001 = buildMockSuggestions(now, prospect1001);
        await db.insert(suggestions).values(rows1001);
        this.logger.log(`[MOCK] Seeded ${rows1001.length} suggestions for operator 1001`);
      } else {
        this.logger.log(`[MOCK] Operator 1001 has ${pending1001.count} pending — skipping`);
      }

      // ── Operator 1002: Bay Area Flight Training (medium dataset) ──────
      const [pending1002] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(suggestions)
        .where(and(eq(suggestions.operatorId, 1002), eq(suggestions.status, 'pending')));

      if ((pending1002?.count ?? 0) === 0) {
        const prospect1002 = await this.seedProspect(1002, 'Tom', 'Baker', 'tom.baker@gmail.com', '(408) 555-0234');
        const rows1002 = buildOperator1002Suggestions(now, prospect1002);
        await db.insert(suggestions).values(rows1002);
        this.logger.log(`[MOCK] Seeded ${rows1002.length} suggestions for operator 1002`);
      } else {
        this.logger.log(`[MOCK] Operator 1002 has ${pending1002.count} pending — skipping`);
      }

      // ── Operator 1003: Pacific Coast Aviation (small dataset) ─────────
      const [pending1003] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(suggestions)
        .where(and(eq(suggestions.operatorId, 1003), eq(suggestions.status, 'pending')));

      if ((pending1003?.count ?? 0) === 0) {
        const prospect1003 = await this.seedProspect(1003, 'Lisa', 'Chang', 'lisa.chang@gmail.com', '(510) 555-0187');
        const rows1003 = buildOperator1003Suggestions(now, prospect1003);
        await db.insert(suggestions).values(rows1003);
        this.logger.log(`[MOCK] Seeded ${rows1003.length} suggestions for operator 1003`);
      } else {
        this.logger.log(`[MOCK] Operator 1003 has ${pending1003.count} pending — skipping`);
      }

      // ── Seed audit events for all operators ───────────────────────────
      for (const opId of [MOCK_OPERATOR_ID, 1002, 1003]) {
        const inserted = await db
          .select({ id: suggestions.id, type: suggestions.type, status: suggestions.status, createdAt: suggestions.createdAt })
          .from(suggestions)
          .where(eq(suggestions.operatorId, opId));
        await this.seedAuditEvents(inserted, now, opId);
      }

      this.logger.log('[MOCK] Seed complete for all operators');
    } catch (error) {
      // Non-fatal: if seeding fails, log and continue
      this.logger.warn(
        `[MOCK] Failed to seed — this is non-fatal. Error: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Seed resource tables: students, instructors, aircraft, activity_types, reservation_history.
   * Idempotent — skips if students table already has data.
   */
  private async seedResources(): Promise<void> {
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(students);
    if ((countResult?.count ?? 0) > 0) {
      this.logger.log('[MOCK] Resource tables already seeded — upserting instructors for new entries');
      // Ensure any newly added instructors get inserted (onConflictDoNothing handles existing ones)
      for (const op of MOCK_ALL_OPERATORS) {
        const mockInstructors = MOCK_INSTRUCTORS_BY_OPERATOR[op.id] ?? [];
        if (mockInstructors.length > 0) {
          await db.insert(instructors).values(
            mockInstructors.map((i) => ({
              id: i.id,
              operatorId: op.id,
              firstName: i.firstName,
              lastName: i.lastName,
              instructorType: i.instructorType || null,
              isActive: i.isActive,
            })),
          ).onConflictDoNothing();
        }
      }
      return;
    }

    const now = new Date();

    // Activity types (shared across all operators)
    const activityTypeRows = [
      { id: 'at-001', name: 'Private Pilot Training', isActive: true },
      { id: 'at-002', name: 'Instrument Training', isActive: true },
      { id: 'at-003', name: 'Discovery Flight', isActive: true },
      { id: 'at-004', name: 'Aircraft Rental', isActive: true },
      { id: 'at-005', name: 'Ground School', isActive: true },
    ];

    for (const op of MOCK_ALL_OPERATORS) {
      const opId = op.id;

      // Insert activity types per operator
      await db.insert(activityTypes).values(
        activityTypeRows.map((at) => ({
          id: `${at.id}-${opId}`,
          operatorId: opId,
          name: at.name,
          isActive: at.isActive,
        })),
      ).onConflictDoNothing();

      // Also insert with base IDs for operator 1001 (backward compat)
      if (opId === MOCK_OPERATOR_ID) {
        await db.insert(activityTypes).values(
          activityTypeRows.map((at) => ({
            id: at.id,
            operatorId: opId,
            name: at.name,
            isActive: at.isActive,
          })),
        ).onConflictDoNothing();
      }

      // Insert students
      const mockStudents = MOCK_STUDENTS_BY_OPERATOR[opId] ?? [];
      // Realistic total flight hours per student
      const flightHoursMap: Record<string, number> = {
        'stu-001': 42.5, 'stu-002': 28.3, 'stu-003': 156.8, 'stu-004': 15.2,
        'stu-005': 8.7, 'stu-006': 63.1,
        'stu-101': 35.0, 'stu-102': 22.5, 'stu-103': 10.0,
        'stu-201': 18.0, 'stu-202': 45.5,
      };
      if (mockStudents.length > 0) {
        await db.insert(students).values(
          mockStudents.map((s) => ({
            id: s.id,
            operatorId: opId,
            firstName: s.firstName,
            lastName: s.lastName,
            email: s.email || null,
            totalFlightHours: String(flightHoursMap[s.id] ?? 0),
          })),
        ).onConflictDoNothing();
      }

      // Insert instructors
      const mockInstructors = MOCK_INSTRUCTORS_BY_OPERATOR[opId] ?? [];
      if (mockInstructors.length > 0) {
        await db.insert(instructors).values(
          mockInstructors.map((i) => ({
            id: i.id,
            operatorId: opId,
            firstName: i.firstName,
            lastName: i.lastName,
            instructorType: i.instructorType || null,
            isActive: i.isActive,
          })),
        ).onConflictDoNothing();
      }

      // Insert aircraft
      const mockAircraft = MOCK_AIRCRAFT_BY_OPERATOR[opId] ?? [];
      if (mockAircraft.length > 0) {
        await db.insert(aircraft).values(
          mockAircraft.map((a) => ({
            id: a.id,
            operatorId: opId,
            registration: a.registration,
            makeModel: a.makeModel || `${a.make} ${a.model}`,
            isSimulator: a.isSimulator,
            isActive: a.isActive,
          })),
        ).onConflictDoNothing();
      }
    }

    // Seed reservation history for operator 1001 (richest dataset)
    const historyRows = this.buildReservationHistory(now);
    if (historyRows.length > 0) {
      await db.insert(reservationHistory).values(historyRows);
    }

    this.logger.log(`[MOCK] Seeded resource tables for ${MOCK_ALL_OPERATORS.length} operators`);
  }

  /**
   * Seed student insights by computing from existing reservation_history and students tables.
   * Idempotent — skips if student_insights already has data.
   */
  private async seedStudentInsights(): Promise<void> {
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(studentInsights);
    if ((countResult?.count ?? 0) > 0) {
      this.logger.log('[MOCK] Student insights already seeded — skipping');
      return;
    }

    const now = new Date();
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    // Mock enrollment data (same as in student-insights.service.ts)
    const enrollmentData: Record<string, { completed: number; total: number }> = {
      'stu-001': { completed: 16, total: 40 },
      'stu-002': { completed: 9, total: 30 },
      'stu-003': { completed: 38, total: 40 },  // 95% — checkride ready
      'stu-004': { completed: 6, total: 30 },
      'stu-005': { completed: 3, total: 40 },
      'stu-006': { completed: 25, total: 40 },
      'stu-101': { completed: 10, total: 40 },
      'stu-102': { completed: 8, total: 40 },
      'stu-103': { completed: 4, total: 40 },
      'stu-201': { completed: 5, total: 40 },
      'stu-202': { completed: 15, total: 40 },
    };

    const rows: Array<{
      operatorId: number;
      studentId: string;
      studentName: string;
      lastFlightDate: Date | null;
      nextFlightDate: Date | null;
      daysSinceLastFlight: number | null;
      totalFlightHours: string;
      enrollmentProgress: string | null;
      isInactive: boolean;
      isCheckrideReady: boolean;
      isAtRisk: boolean;
      riskReason: string | null;
      computedAt: Date;
    }> = [];

    for (const op of MOCK_ALL_OPERATORS) {
      const opStudents = await db.select().from(students).where(eq(students.operatorId, op.id));

      for (const student of opStudents) {
        // Get last completed flight
        const [lastFlight] = await db
          .select({ endTime: reservationHistory.endTime })
          .from(reservationHistory)
          .where(
            and(
              eq(reservationHistory.operatorId, op.id),
              eq(reservationHistory.studentId, student.id),
              eq(reservationHistory.status, 'completed'),
              lte(reservationHistory.endTime, now),
            ),
          )
          .orderBy(desc(reservationHistory.endTime))
          .limit(1);

        // Get next upcoming flight
        const [nextFlight] = await db
          .select({ startTime: reservationHistory.startTime })
          .from(reservationHistory)
          .where(
            and(
              eq(reservationHistory.operatorId, op.id),
              eq(reservationHistory.studentId, student.id),
              gte(reservationHistory.startTime, now),
              sql`${reservationHistory.status} != 'cancelled'`,
            ),
          )
          .limit(1);

        const daysSince = lastFlight
          ? Math.floor((now.getTime() - lastFlight.endTime.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const isInactive = (daysSince !== null && daysSince >= 14 && !nextFlight) ||
          (daysSince === null && !nextFlight);

        // Enrollment progress
        const enrollment = enrollmentData[student.id];
        const progress = enrollment
          ? Math.round((enrollment.completed / enrollment.total) * 10000) / 100
          : null;
        const isCheckrideReady = progress !== null && progress >= 90;

        // At-risk: check for increasing flight gaps
        let isAtRisk = false;
        let riskReason: string | null = null;

        const flights = await db
          .select({
            startTime: reservationHistory.startTime,
            endTime: reservationHistory.endTime,
          })
          .from(reservationHistory)
          .where(
            and(
              eq(reservationHistory.operatorId, op.id),
              eq(reservationHistory.studentId, student.id),
              eq(reservationHistory.status, 'completed'),
              lte(reservationHistory.endTime, now),
            ),
          )
          .orderBy(reservationHistory.endTime);

        if (flights.length >= 3) {
          const gaps: number[] = [];
          for (let i = 1; i < flights.length; i++) {
            const gap = (flights[i]!.startTime.getTime() - flights[i - 1]!.endTime.getTime()) / (1000 * 60 * 60 * 24);
            gaps.push(gap);
          }
          let increasing = true;
          for (let i = 1; i < gaps.length; i++) {
            if (gaps[i]! <= gaps[i - 1]!) {
              increasing = false;
              break;
            }
          }
          if (increasing) {
            isAtRisk = true;
            const firstGap = Math.round(gaps[0]!);
            const lastGap = Math.round(gaps[gaps.length - 1]!);
            riskReason = `Flight gaps increasing: ${firstGap}d -> ${lastGap}d between sessions. Training momentum declining.`;
          }
        }

        rows.push({
          operatorId: op.id,
          studentId: student.id,
          studentName: `${student.firstName} ${student.lastName}`,
          lastFlightDate: lastFlight?.endTime ?? null,
          nextFlightDate: nextFlight?.startTime ?? null,
          daysSinceLastFlight: daysSince,
          totalFlightHours: String(student.totalFlightHours),
          enrollmentProgress: progress !== null ? String(progress) : null,
          isInactive,
          isCheckrideReady,
          isAtRisk,
          riskReason,
          computedAt: now,
        });
      }
    }

    if (rows.length > 0) {
      await db.insert(studentInsights).values(rows);
    }

    const inactive = rows.filter((r) => r.isInactive).length;
    const checkrideReady = rows.filter((r) => r.isCheckrideReady).length;
    const atRisk = rows.filter((r) => r.isAtRisk).length;
    this.logger.log(
      `[MOCK] Seeded ${rows.length} student insights (${inactive} inactive, ${checkrideReady} checkride-ready, ${atRisk} at-risk)`,
    );
  }

  /**
   * Build realistic reservation history for operator 1001.
   * Includes past completed flights and some upcoming scheduled ones.
   */
  private buildReservationHistory(now: Date) {
    const op = MOCK_OPERATOR_ID;
    const loc = 'loc-001';
    const rows: Array<{
      operatorId: number; studentId: string; instructorId: string;
      aircraftId: string; activityTypeId: string; locationId: string;
      startTime: Date; endTime: Date; status: string;
    }> = [];

    function pastDate(daysAgo: number, hour: number, minute = 0): Date {
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      d.setHours(hour, minute, 0, 0);
      return d;
    }

    function futureDate(daysAhead: number, hour: number, minute = 0): Date {
      const d = new Date(now);
      d.setDate(d.getDate() + daysAhead);
      d.setHours(hour, minute, 0, 0);
      return d;
    }

    // stu-001 (Alex Johnson) — 42.5 hours, last flight 2 days ago, next in 3 days
    rows.push(
      { operatorId: op, studentId: 'stu-001', instructorId: 'inst-001', aircraftId: 'ac-001', activityTypeId: 'at-001', locationId: loc, startTime: pastDate(2, 8), endTime: pastDate(2, 10), status: 'completed' },
      { operatorId: op, studentId: 'stu-001', instructorId: 'inst-001', aircraftId: 'ac-001', activityTypeId: 'at-001', locationId: loc, startTime: pastDate(5, 9), endTime: pastDate(5, 11), status: 'completed' },
      { operatorId: op, studentId: 'stu-001', instructorId: 'inst-001', aircraftId: 'ac-002', activityTypeId: 'at-001', locationId: loc, startTime: pastDate(9, 14), endTime: pastDate(9, 16), status: 'completed' },
      { operatorId: op, studentId: 'stu-001', instructorId: 'inst-001', aircraftId: 'ac-001', activityTypeId: 'at-001', locationId: loc, startTime: futureDate(3, 10), endTime: futureDate(3, 12), status: 'completed' },
    );

    // stu-002 (Emily Davis) — 28.3 hours, last flight 4 days ago, next in 1 day
    rows.push(
      { operatorId: op, studentId: 'stu-002', instructorId: 'inst-002', aircraftId: 'ac-001', activityTypeId: 'at-002', locationId: loc, startTime: pastDate(4, 14), endTime: pastDate(4, 16), status: 'completed' },
      { operatorId: op, studentId: 'stu-002', instructorId: 'inst-002', aircraftId: 'ac-003', activityTypeId: 'at-002', locationId: loc, startTime: pastDate(7, 8), endTime: pastDate(7, 10), status: 'completed' },
      { operatorId: op, studentId: 'stu-002', instructorId: 'inst-002', aircraftId: 'ac-001', activityTypeId: 'at-002', locationId: loc, startTime: futureDate(1, 9), endTime: futureDate(1, 11), status: 'completed' },
    );

    // stu-003 (Ryan Martinez) — 156.8 hours, last flight 1 day ago, next in 5 days
    rows.push(
      { operatorId: op, studentId: 'stu-003', instructorId: 'inst-003', aircraftId: 'ac-002', activityTypeId: 'at-001', locationId: loc, startTime: pastDate(1, 7), endTime: pastDate(1, 9), status: 'completed' },
      { operatorId: op, studentId: 'stu-003', instructorId: 'inst-003', aircraftId: 'ac-001', activityTypeId: 'at-001', locationId: loc, startTime: pastDate(3, 8), endTime: pastDate(3, 10), status: 'completed' },
      { operatorId: op, studentId: 'stu-003', instructorId: 'inst-001', aircraftId: 'ac-002', activityTypeId: 'at-001', locationId: loc, startTime: futureDate(5, 8), endTime: futureDate(5, 10, 30), status: 'completed' },
    );

    // stu-004 (Sophie Brown) — 15.2 hours, last flight 10 days ago, no upcoming
    rows.push(
      { operatorId: op, studentId: 'stu-004', instructorId: 'inst-002', aircraftId: 'ac-003', activityTypeId: 'at-002', locationId: loc, startTime: pastDate(10, 14), endTime: pastDate(10, 16), status: 'completed' },
      { operatorId: op, studentId: 'stu-004', instructorId: 'inst-002', aircraftId: 'ac-001', activityTypeId: 'at-002', locationId: loc, startTime: pastDate(14, 9), endTime: pastDate(14, 11), status: 'completed' },
    );

    // stu-005 (Tyler Lee) — 8.7 hours, last flight 7 days ago, no upcoming
    rows.push(
      { operatorId: op, studentId: 'stu-005', instructorId: 'inst-001', aircraftId: 'ac-002', activityTypeId: 'at-001', locationId: loc, startTime: pastDate(7, 13), endTime: pastDate(7, 14, 30), status: 'completed' },
      { operatorId: op, studentId: 'stu-005', instructorId: 'inst-001', aircraftId: 'ac-002', activityTypeId: 'at-001', locationId: loc, startTime: pastDate(12, 10), endTime: pastDate(12, 12), status: 'completed' },
    );

    // stu-006 (Mia Garcia) — 63.1 hours, last flight 3 days ago, cancelled today
    rows.push(
      { operatorId: op, studentId: 'stu-006', instructorId: 'inst-003', aircraftId: 'ac-002', activityTypeId: 'at-001', locationId: loc, startTime: pastDate(3, 8), endTime: pastDate(3, 10), status: 'completed' },
      { operatorId: op, studentId: 'stu-006', instructorId: 'inst-003', aircraftId: 'ac-002', activityTypeId: 'at-001', locationId: loc, startTime: pastDate(0, 8), endTime: pastDate(0, 10), status: 'cancelled' },
    );

    // Operator 1002 students
    rows.push(
      { operatorId: 1002, studentId: 'stu-101', instructorId: 'inst-101', aircraftId: 'ac-101', activityTypeId: 'at-001', locationId: 'loc-101', startTime: pastDate(3, 9), endTime: pastDate(3, 11), status: 'completed' },
      { operatorId: 1002, studentId: 'stu-102', instructorId: 'inst-102', aircraftId: 'ac-102', activityTypeId: 'at-001', locationId: 'loc-101', startTime: pastDate(5, 14), endTime: pastDate(5, 16), status: 'completed' },
      { operatorId: 1002, studentId: 'stu-103', instructorId: 'inst-101', aircraftId: 'ac-103', activityTypeId: 'at-001', locationId: 'loc-101', startTime: pastDate(8, 10), endTime: pastDate(8, 12), status: 'completed' },
    );

    // Operator 1003 students
    rows.push(
      { operatorId: 1003, studentId: 'stu-201', instructorId: 'inst-201', aircraftId: 'ac-201', activityTypeId: 'at-001', locationId: 'loc-201', startTime: pastDate(2, 8), endTime: pastDate(2, 10), status: 'completed' },
      { operatorId: 1003, studentId: 'stu-201', instructorId: 'inst-201', aircraftId: 'ac-201', activityTypeId: 'at-001', locationId: 'loc-201', startTime: futureDate(1, 8), endTime: futureDate(1, 10), status: 'completed' },
      { operatorId: 1003, studentId: 'stu-202', instructorId: 'inst-201', aircraftId: 'ac-202', activityTypeId: 'at-001', locationId: 'loc-201', startTime: pastDate(6, 14), endTime: pastDate(6, 16), status: 'completed' },
    );

    return rows;
  }

  /**
   * Seed default cancellation reasons for all operators.
   * Idempotent — skips if cancellation_reasons already has data.
   */
  private async seedCancellationReasons(): Promise<void> {
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(cancellationReasons);
    if ((countResult?.count ?? 0) > 0) {
      this.logger.log('[MOCK] Cancellation reasons already seeded — skipping');
      return;
    }

    const defaultReasons = [
      'Weather',
      'Student Request',
      'Instructor Unavailable',
      'Aircraft Maintenance',
      'Medical',
      'No Show',
      'Other',
    ];

    for (const op of MOCK_ALL_OPERATORS) {
      await db.insert(cancellationReasons).values(
        defaultReasons.map((name) => ({
          operatorId: op.id,
          name,
          isActive: true,
        })),
      ).onConflictDoNothing();
    }

    this.logger.log(`[MOCK] Seeded cancellation reasons for ${MOCK_ALL_OPERATORS.length} operators`);
  }

  /**
   * Seed a discovery-flight prospect and return the UUID.
   */
  private async seedProspect(
    operatorId: number, firstName: string, lastName: string, email: string, phone: string,
  ): Promise<string> {
    const preferredDate = new Date();
    preferredDate.setDate(preferredDate.getDate() + 3);
    const dateStr = preferredDate.toISOString().split('T')[0];

    const [prospect] = await db
      .insert(prospects)
      .values({
        operatorId,
        firstName,
        lastName,
        email,
        phone,
        preferredDates: [{ date: dateStr, timeOfDay: 'morning' }],
        status: 'pending',
      })
      .returning({ id: prospects.id });

    this.logger.log(`[MOCK] Seeded prospect ${prospect!.id} for operator ${operatorId}`);
    return prospect!.id;
  }

  /**
   * Seed audit events matching the suggestion history so the activity feed is populated.
   */
  private async seedAuditEvents(
    insertedSuggestions: Array<{ id: string; type: string; status: string; createdAt: Date }>,
    now: Date,
    operatorId: number = MOCK_OPERATOR_ID,
  ): Promise<void> {
    const events: Array<{
      operatorId: number;
      eventType: string;
      entityType: string;
      entityId: string;
      actorId: string | null;
      data: Record<string, unknown>;
      createdAt: Date;
    }> = [];

    // suggestion.created for each suggestion (stagger creation times)
    for (let i = 0; i < insertedSuggestions.length; i++) {
      const s = insertedSuggestions[i]!;
      events.push({
        operatorId,
        eventType: 'suggestion_created',
        entityType: 'suggestion',
        entityId: s.id,
        actorId: 'system',
        data: { suggestionType: s.type, status: s.status },
        createdAt: new Date(now.getTime() - (insertedSuggestions.length - i) * 30 * 60 * 1000), // stagger by 30min
      });
    }

    // Find the approved, declined, and expired suggestions for specific events
    const approved = insertedSuggestions.filter((s) => s.status === 'approved');
    const declined = insertedSuggestions.filter((s) => s.status === 'declined');
    const expired = insertedSuggestions.filter((s) => s.status === 'expired');

    for (const s of approved) {
      events.push({
        operatorId,
        eventType: 'suggestion_approved',
        entityType: 'suggestion',
        entityId: s.id,
        actorId: 'usr-001',
        data: { suggestionType: s.type, approvedBy: 'Scheduler' },
        createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      });
    }

    for (const s of declined) {
      events.push({
        operatorId,
        eventType: 'suggestion_declined',
        entityType: 'suggestion',
        entityId: s.id,
        actorId: 'usr-001',
        data: { suggestionType: s.type, reason: 'Student prefers a different week' },
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      });
    }

    for (const s of expired) {
      events.push({
        operatorId,
        eventType: 'suggestion_expired',
        entityType: 'suggestion',
        entityId: s.id,
        actorId: 'system',
        data: { suggestionType: s.type, reason: 'slot_filled' },
        createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      });
    }

    if (events.length > 0) {
      await db.insert(auditEvents).values(events);
      this.logger.log(`[MOCK] Seeded ${events.length} audit events for operator ${operatorId}`);
    }
  }

  /**
   * Seed disruption events.
   * Creates a maintenance warning for ac-002 (approaching 100-hr inspection).
   * Weather disruptions are not seeded — they come from live API via the scan endpoint.
   * Idempotent — skips if disruption_events already has data.
   */
  private async seedDisruptionEvents(): Promise<void> {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(disruptionEvents);

    if ((countResult?.count ?? 0) > 0) {
      this.logger.log('[MOCK] Disruption events already seeded — skipping');
      return;
    }

    const now = new Date();

    // ac-002 (N152AB) has 8210.7h hobbs, due at 8250h — 39.3h remaining (critical < 50h)
    await db.insert(disruptionEvents).values({
      operatorId: MOCK_OPERATOR_ID,
      type: 'maintenance',
      severity: 'warning',
      title: 'N152AB approaching 100-hr inspection',
      description:
        'Aircraft N152AB (Cessna 152) has 39.3h remaining before 100-hour inspection is due. ' +
        'Current hobbs: 8210.7h, due at 8250.0h. ' +
        'Upcoming reservations using this aircraft may need to be reassigned.',
      affectedReservationIds: [],
      affectedStudentIds: [],
      affectedAircraftIds: ['ac-002'],
      locationId: null,
      detectedAt: now,
      resolvedAt: null,
      isActive: true,
      metadata: {
        aircraftId: 'ac-002',
        registration: 'N152AB',
        currentHobbs: 8210.7,
        inspectionDue: 8250,
        remainingHours: 39.3,
      },
    });

    this.logger.log('[MOCK] Seeded 1 disruption event (maintenance warning for ac-002)');
  }

  /**
   * Seed flight alerts for all operators.
   * Creates an overdue_return (critical) and a maintenance_due (warning) for operator 1001.
   * Idempotent — skips if flight_alerts already has data.
   */
  private async seedFlightAlerts(): Promise<void> {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(flightAlerts);

    if ((countResult?.count ?? 0) > 0) {
      this.logger.log('[MOCK] Flight alerts already seeded — skipping');
      return;
    }

    const now = new Date();

    await db.insert(flightAlerts).values([
      {
        operatorId: MOCK_OPERATOR_ID,
        reservationId: 'res-003',
        alertType: 'overdue_return',
        severity: 'critical',
        title: 'Aircraft N152AB overdue return',
        description:
          'Aircraft N152AB (Cessna 152) was scheduled to return at 14:00 but has not been checked in. ' +
          'Pilot: Ryan Martinez, Instructor: David Kim. ' +
          'Last known position: local training area. Please verify aircraft status.',
        aircraftId: 'ac-002',
        instructorId: 'inst-003',
        studentId: 'stu-003',
        isResolved: false,
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      },
      {
        operatorId: MOCK_OPERATOR_ID,
        reservationId: null,
        alertType: 'maintenance_due',
        severity: 'warning',
        title: 'N182RG approaching 100-hr inspection',
        description:
          'Aircraft N182RG (Cessna 182RG) has 12.4 hours remaining before 100-hour inspection is due. ' +
          'Current hobbs: 4237.6h, due at 4250.0h. ' +
          'Consider scheduling maintenance or restricting future bookings.',
        aircraftId: 'ac-003',
        instructorId: null,
        studentId: null,
        isResolved: false,
        createdAt: new Date(now.getTime() - 8 * 60 * 60 * 1000), // 8 hours ago
      },
    ]);

    this.logger.log('[MOCK] Seeded 2 flight alerts for operator 1001');
  }
}

// ─── Seed Data Builder ────────────────────────────────────────────────────────

interface SuggestionInsert {
  operatorId: number;
  type: string;
  status: string;
  locationId: string;
  studentId: string | null;
  prospectId: string | null;
  instructorId: string | null;
  aircraftId: string | null;
  proposedStart: Date;
  proposedEnd: Date;
  activityTypeId: string | null;
  courseId: string | null;
  lessonId: string | null;
  enrollmentId: string | null;
  rankingScore: string;
  rationale: Record<string, unknown>;
  groupId: string | null;
  expiresAt: Date;
  approvedBy: string | null;
  approvedAt: Date | null;
  declinedBy: string | null;
  declinedAt: Date | null;
  expiredReason: string | null;
  fspReservationId: string | null;
  fspValidationErrors: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function hoursFromNow(hours: number, base: Date): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function daysFromNow(days: number, hour: number, minute: number, base: Date): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function buildMockSuggestions(now: Date, prospectId: string): SuggestionInsert[] {
  const op = MOCK_OPERATOR_ID;
  const loc = 'loc-001';

  // Group ID shared by the waitlist suggestions
  const waitlistGroup = '00000000-0000-4000-a000-000000000001';

  return [
    // ── 4 Waitlist suggestions (pending) with varying scores ─────────────
    {
      operatorId: op,
      type: 'waitlist',
      status: 'pending',
      locationId: loc,
      studentId: 'stu-001',
      prospectId: null,
      instructorId: 'inst-001',
      aircraftId: 'ac-001',
      proposedStart: daysFromNow(1, 10, 0, now),
      proposedEnd: daysFromNow(1, 12, 0, now),
      activityTypeId: 'at-001',
      courseId: 'crs-ppl',
      lessonId: 'ppl-les-016',
      enrollmentId: 'enr-001',
      rankingScore: '92.5000',
      rationale: {
        summary: 'Alex Johnson can fill the 10-12 slot vacated by a cancellation tomorrow. CFI James Wilson is available and N172SP is free.',
        inputs: {
          cancellationDetectedAt: now.toISOString(),
          originalPilot: 'Tyler Lee',
          slotDuration: 120,
        },
        constraints: {
          instructorAvailable: true,
          aircraftAvailable: true,
          studentAvailable: true,
          withinCivilTwilight: true,
        },
        policies: {
          maxDailyFlightHours: 8,
          minRestPeriod: 10,
          priorityWeight: 0.92,
        },
      },
      groupId: waitlistGroup,
      expiresAt: hoursFromNow(24, now),
      approvedBy: null,
      approvedAt: null,
      declinedBy: null,
      declinedAt: null,
      expiredReason: null,
      fspReservationId: null,
      fspValidationErrors: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      operatorId: op,
      type: 'waitlist',
      status: 'pending',
      locationId: loc,
      studentId: 'stu-002',
      prospectId: null,
      instructorId: 'inst-002',
      aircraftId: 'ac-001',
      proposedStart: daysFromNow(1, 10, 0, now),
      proposedEnd: daysFromNow(1, 12, 0, now),
      activityTypeId: 'at-002',
      courseId: 'crs-ir',
      lessonId: 'ir-les-009',
      enrollmentId: 'enr-002',
      rankingScore: '85.2500',
      rationale: {
        summary: 'Emily Davis is next on the waitlist for instrument training. CFII Lisa Park is available and the same N172SP slot works for ILS approach practice.',
        inputs: {
          cancellationDetectedAt: now.toISOString(),
          waitlistPosition: 2,
          slotDuration: 120,
        },
        constraints: {
          instructorAvailable: true,
          aircraftAvailable: true,
          studentAvailable: true,
          withinCivilTwilight: true,
        },
        policies: {
          maxDailyFlightHours: 8,
          minRestPeriod: 10,
          priorityWeight: 0.85,
        },
      },
      groupId: waitlistGroup,
      expiresAt: hoursFromNow(24, now),
      approvedBy: null,
      approvedAt: null,
      declinedBy: null,
      declinedAt: null,
      expiredReason: null,
      fspReservationId: null,
      fspValidationErrors: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      operatorId: op,
      type: 'waitlist',
      status: 'pending',
      locationId: loc,
      studentId: 'stu-003',
      prospectId: null,
      instructorId: 'inst-003',
      aircraftId: 'ac-002',
      proposedStart: daysFromNow(2, 8, 0, now),
      proposedEnd: daysFromNow(2, 10, 0, now),
      activityTypeId: 'at-001',
      courseId: 'crs-ppl',
      lessonId: 'ppl2-les-039',
      enrollmentId: 'enr-003',
      rankingScore: '78.0000',
      rationale: {
        summary: 'Ryan Martinez needs checkride prep and day-after-tomorrow morning has an opening. CFI David Kim is available with N152AB.',
        inputs: {
          cancellationDetectedAt: now.toISOString(),
          waitlistPosition: 3,
          slotDuration: 120,
        },
        constraints: {
          instructorAvailable: true,
          aircraftAvailable: true,
          studentAvailable: true,
          withinCivilTwilight: true,
        },
        policies: {
          maxDailyFlightHours: 8,
          minRestPeriod: 10,
          priorityWeight: 0.78,
        },
      },
      groupId: waitlistGroup,
      expiresAt: hoursFromNow(24, now),
      approvedBy: null,
      approvedAt: null,
      declinedBy: null,
      declinedAt: null,
      expiredReason: null,
      fspReservationId: null,
      fspValidationErrors: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      operatorId: op,
      type: 'waitlist',
      status: 'pending',
      locationId: loc,
      studentId: 'stu-005',
      prospectId: null,
      instructorId: 'inst-001',
      aircraftId: 'ac-002',
      proposedStart: daysFromNow(3, 13, 0, now),
      proposedEnd: daysFromNow(3, 14, 30, now),
      activityTypeId: 'at-001',
      courseId: null,
      lessonId: null,
      enrollmentId: null,
      rankingScore: '65.7500',
      rationale: {
        summary: 'Tyler Lee was on the aircraft rental waitlist. An afternoon slot opened up in 3 days with N152AB.',
        inputs: {
          cancellationDetectedAt: now.toISOString(),
          waitlistPosition: 4,
          slotDuration: 90,
        },
        constraints: {
          instructorAvailable: true,
          aircraftAvailable: true,
          studentAvailable: true,
          withinCivilTwilight: true,
        },
        policies: {
          maxDailyFlightHours: 8,
          minRestPeriod: 10,
          priorityWeight: 0.66,
        },
      },
      groupId: waitlistGroup,
      expiresAt: hoursFromNow(24, now),
      approvedBy: null,
      approvedAt: null,
      declinedBy: null,
      declinedAt: null,
      expiredReason: null,
      fspReservationId: null,
      fspValidationErrors: null,
      createdAt: now,
      updatedAt: now,
    },

    // ── 2 Reschedule suggestions (pending) ──────────────────────────────
    {
      operatorId: op,
      type: 'reschedule',
      status: 'pending',
      locationId: loc,
      studentId: 'stu-004',
      prospectId: null,
      instructorId: 'inst-002',
      aircraftId: 'ac-003',
      proposedStart: daysFromNow(2, 14, 0, now),
      proposedEnd: daysFromNow(2, 16, 0, now),
      activityTypeId: 'at-002',
      courseId: null,
      lessonId: null,
      enrollmentId: null,
      rankingScore: '70.0000',
      rationale: {
        summary: 'Sophie Brown requested a reschedule from morning to afternoon. CFII Lisa Park has availability and N182RG is free in the 2-4pm slot.',
        inputs: {
          originalStart: daysFromNow(2, 8, 0, now).toISOString(),
          originalEnd: daysFromNow(2, 10, 0, now).toISOString(),
          rescheduleReason: 'student_request',
        },
        constraints: {
          instructorAvailable: true,
          aircraftAvailable: true,
          studentAvailable: true,
          withinCivilTwilight: true,
        },
        policies: {
          maxRescheduleAlternatives: 5,
          searchWindowDays: 7,
        },
      },
      groupId: null,
      expiresAt: hoursFromNow(24, now),
      approvedBy: null,
      approvedAt: null,
      declinedBy: null,
      declinedAt: null,
      expiredReason: null,
      fspReservationId: null,
      fspValidationErrors: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      operatorId: op,
      type: 'reschedule',
      status: 'pending',
      locationId: loc,
      studentId: 'stu-006',
      prospectId: null,
      instructorId: 'inst-003',
      aircraftId: 'ac-002',
      proposedStart: daysFromNow(4, 9, 0, now),
      proposedEnd: daysFromNow(4, 11, 0, now),
      activityTypeId: 'at-001',
      courseId: null,
      lessonId: null,
      enrollmentId: null,
      rankingScore: '68.5000',
      rationale: {
        summary: 'Mia Garcia weather-cancelled flight rescheduled to 4 days out. CFI David Kim and N152AB both free.',
        inputs: {
          originalStart: daysFromNow(0, 8, 0, now).toISOString(),
          originalEnd: daysFromNow(0, 10, 0, now).toISOString(),
          rescheduleReason: 'weather',
        },
        constraints: {
          instructorAvailable: true,
          aircraftAvailable: true,
          studentAvailable: true,
          withinCivilTwilight: true,
        },
        policies: {
          maxRescheduleAlternatives: 5,
          searchWindowDays: 7,
        },
      },
      groupId: null,
      expiresAt: hoursFromNow(24, now),
      approvedBy: null,
      approvedAt: null,
      declinedBy: null,
      declinedAt: null,
      expiredReason: null,
      fspReservationId: null,
      fspValidationErrors: null,
      createdAt: now,
      updatedAt: now,
    },

    // ── 1 Discovery flight suggestion (pending) — linked to prospect ───
    {
      operatorId: op,
      type: 'discovery',
      status: 'pending',
      locationId: loc,
      studentId: null,
      prospectId: prospectId,
      instructorId: 'inst-001',
      aircraftId: 'ac-001',
      proposedStart: daysFromNow(3, 10, 0, now),
      proposedEnd: daysFromNow(3, 11, 0, now),
      activityTypeId: 'at-003',
      courseId: null,
      lessonId: null,
      enrollmentId: null,
      rankingScore: '55.0000',
      rationale: {
        summary: 'Jane Smith requested a discovery flight. CFI James Wilson and N172SP available for a 1-hour intro flight.',
        inputs: {
          prospectName: 'Jane Smith',
          preferredTimeOfDay: 'morning',
        },
        constraints: {
          instructorAvailable: true,
          aircraftAvailable: true,
          withinCivilTwilight: true,
        },
        policies: {
          discoveryFlightDuration: 60,
          preferCFI: true,
        },
      },
      groupId: null,
      expiresAt: hoursFromNow(48, now),
      approvedBy: null,
      approvedAt: null,
      declinedBy: null,
      declinedAt: null,
      expiredReason: null,
      fspReservationId: null,
      fspValidationErrors: null,
      createdAt: now,
      updatedAt: now,
    },

    // ── 1 Next-lesson suggestion (pending) ──────────────────────────────
    {
      operatorId: op,
      type: 'next_lesson',
      status: 'pending',
      locationId: loc,
      studentId: 'stu-003',
      prospectId: null,
      instructorId: 'inst-001',
      aircraftId: 'ac-001',
      proposedStart: daysFromNow(5, 8, 0, now),
      proposedEnd: daysFromNow(5, 10, 30, now),
      activityTypeId: 'at-001',
      courseId: 'crs-ppl',
      lessonId: 'ppl2-les-039',
      enrollmentId: 'enr-003',
      rankingScore: '88.0000',
      rationale: {
        summary: 'Ryan Martinez is at lesson 39/40 (checkride prep). Scheduling this soon keeps momentum for the final checkride.',
        inputs: {
          completedLessons: 38,
          totalLessons: 40,
          daysSinceLastLesson: 3,
        },
        constraints: {
          instructorAvailable: true,
          aircraftAvailable: true,
          studentAvailable: true,
          withinCivilTwilight: true,
        },
        policies: {
          maxGapDays: 7,
          nearCompletionBoost: true,
        },
      },
      groupId: null,
      expiresAt: hoursFromNow(24, now),
      approvedBy: null,
      approvedAt: null,
      declinedBy: null,
      declinedAt: null,
      expiredReason: null,
      fspReservationId: null,
      fspValidationErrors: null,
      createdAt: now,
      updatedAt: now,
    },

    // ── 2 Approved suggestions (from earlier today) ─────────────────────
    {
      operatorId: op,
      type: 'waitlist',
      status: 'approved',
      locationId: loc,
      studentId: 'stu-001',
      prospectId: null,
      instructorId: 'inst-001',
      aircraftId: 'ac-001',
      proposedStart: daysFromNow(0, 14, 0, now),
      proposedEnd: daysFromNow(0, 16, 0, now),
      activityTypeId: 'at-001',
      courseId: 'crs-ppl',
      lessonId: 'ppl-les-016',
      enrollmentId: 'enr-001',
      rankingScore: '95.0000',
      rationale: {
        summary: 'Alex Johnson filled a same-day cancellation slot. Approved by scheduler earlier today.',
        inputs: { cancellationDetectedAt: hoursFromNow(-6, now).toISOString() },
        constraints: { instructorAvailable: true, aircraftAvailable: true, studentAvailable: true, withinCivilTwilight: true },
        policies: { priorityWeight: 0.95 },
      },
      groupId: null,
      expiresAt: hoursFromNow(18, now),
      approvedBy: 'usr-001',
      approvedAt: hoursFromNow(-4, now),
      declinedBy: null,
      declinedAt: null,
      expiredReason: null,
      fspReservationId: 'fsp-res-4001',
      fspValidationErrors: null,
      createdAt: hoursFromNow(-6, now),
      updatedAt: hoursFromNow(-4, now),
    },
    {
      operatorId: op,
      type: 'next_lesson',
      status: 'approved',
      locationId: loc,
      studentId: 'stu-002',
      prospectId: null,
      instructorId: 'inst-002',
      aircraftId: 'ac-003',
      proposedStart: daysFromNow(1, 9, 0, now),
      proposedEnd: daysFromNow(1, 11, 0, now),
      activityTypeId: 'at-002',
      courseId: 'crs-ir',
      lessonId: 'ir-les-009',
      enrollmentId: 'enr-002',
      rankingScore: '82.0000',
      rationale: {
        summary: 'Emily Davis next ILS lesson auto-suggested and approved. CFII Lisa Park and N182RG confirmed.',
        inputs: { completedLessons: 8, totalLessons: 30 },
        constraints: { instructorAvailable: true, aircraftAvailable: true, studentAvailable: true, withinCivilTwilight: true },
        policies: { maxGapDays: 7 },
      },
      groupId: null,
      expiresAt: hoursFromNow(20, now),
      approvedBy: 'usr-001',
      approvedAt: hoursFromNow(-3, now),
      declinedBy: null,
      declinedAt: null,
      expiredReason: null,
      fspReservationId: 'fsp-res-4002',
      fspValidationErrors: null,
      createdAt: hoursFromNow(-5, now),
      updatedAt: hoursFromNow(-3, now),
    },

    // ── 1 Declined suggestion ───────────────────────────────────────────
    {
      operatorId: op,
      type: 'reschedule',
      status: 'declined',
      locationId: loc,
      studentId: 'stu-005',
      prospectId: null,
      instructorId: 'inst-003',
      aircraftId: 'ac-002',
      proposedStart: daysFromNow(1, 15, 0, now),
      proposedEnd: daysFromNow(1, 17, 0, now),
      activityTypeId: 'at-001',
      courseId: null,
      lessonId: null,
      enrollmentId: null,
      rankingScore: '50.0000',
      rationale: {
        summary: 'Tyler Lee reschedule suggestion declined by scheduler — student contacted and prefers a different week.',
        inputs: {
          originalStart: daysFromNow(-1, 9, 0, now).toISOString(),
          originalEnd: daysFromNow(-1, 11, 0, now).toISOString(),
          rescheduleReason: 'maintenance',
        },
        constraints: { instructorAvailable: true, aircraftAvailable: true, studentAvailable: true, withinCivilTwilight: true },
        policies: { maxRescheduleAlternatives: 5 },
      },
      groupId: null,
      expiresAt: hoursFromNow(12, now),
      approvedBy: null,
      approvedAt: null,
      declinedBy: 'usr-001',
      declinedAt: hoursFromNow(-2, now),
      expiredReason: null,
      fspReservationId: null,
      fspValidationErrors: null,
      createdAt: hoursFromNow(-8, now),
      updatedAt: hoursFromNow(-2, now),
    },

    // ── 1 Expired suggestion ────────────────────────────────────────────
    {
      operatorId: op,
      type: 'waitlist',
      status: 'expired',
      locationId: loc,
      studentId: 'stu-004',
      prospectId: null,
      instructorId: 'inst-001',
      aircraftId: 'ac-001',
      proposedStart: daysFromNow(-1, 10, 0, now),
      proposedEnd: daysFromNow(-1, 12, 0, now),
      activityTypeId: 'at-001',
      courseId: null,
      lessonId: null,
      enrollmentId: null,
      rankingScore: '72.0000',
      rationale: {
        summary: 'Sophie Brown waitlist suggestion expired — slot was filled by another student before scheduler could review.',
        inputs: { cancellationDetectedAt: hoursFromNow(-30, now).toISOString() },
        constraints: { instructorAvailable: true, aircraftAvailable: true, studentAvailable: true, withinCivilTwilight: true },
        policies: { priorityWeight: 0.72 },
      },
      groupId: null,
      expiresAt: hoursFromNow(-6, now),
      approvedBy: null,
      approvedAt: null,
      declinedBy: null,
      declinedAt: null,
      expiredReason: 'slot_filled',
      fspReservationId: null,
      fspValidationErrors: null,
      createdAt: hoursFromNow(-30, now),
      updatedAt: hoursFromNow(-6, now),
    },
  ];
}

// ─── Operator 1002: Bay Area Flight Training ────────────────────────────────
// 6 suggestions: 3 pending waitlist, 1 pending discovery, 1 approved, 1 declined

function buildOperator1002Suggestions(now: Date, prospectId: string): SuggestionInsert[] {
  const op = 1002;
  const loc = 'loc-101';
  const base = {
    fspReservationId: null, fspValidationErrors: null,
    courseId: null, lessonId: null, enrollmentId: null, groupId: null,
  };

  return [
    {
      ...base, operatorId: op, type: 'waitlist', status: 'pending', locationId: loc,
      studentId: 'stu-101', prospectId: null, instructorId: 'inst-101', aircraftId: 'ac-101',
      proposedStart: daysFromNow(1, 9, 0, now), proposedEnd: daysFromNow(1, 11, 0, now),
      activityTypeId: 'at-001', courseId: 'crs-ppl', lessonId: 'ppl-les-010', enrollmentId: 'enr-101',
      rankingScore: '89.0000',
      rationale: { summary: 'Daniel Okafor can fill morning slot. CFI Carlos Mendez and N738JV available.', inputs: {}, constraints: { instructorAvailable: true, aircraftAvailable: true, studentAvailable: true, withinCivilTwilight: true }, policies: {} },
      expiresAt: hoursFromNow(24, now), approvedBy: null, approvedAt: null, declinedBy: null, declinedAt: null, expiredReason: null,
      createdAt: now, updatedAt: now,
    },
    {
      ...base, operatorId: op, type: 'waitlist', status: 'pending', locationId: loc,
      studentId: 'stu-102', prospectId: null, instructorId: 'inst-102', aircraftId: 'ac-102',
      proposedStart: daysFromNow(2, 14, 0, now), proposedEnd: daysFromNow(2, 16, 0, now),
      activityTypeId: 'at-001', courseId: 'crs-ppl', lessonId: 'ppl-les-008', enrollmentId: 'enr-102',
      rankingScore: '76.5000',
      rationale: { summary: 'Rachel Nguyen next on waitlist. CFII Priya Sharma and Archer III available.', inputs: {}, constraints: { instructorAvailable: true, aircraftAvailable: true, studentAvailable: true, withinCivilTwilight: true }, policies: {} },
      expiresAt: hoursFromNow(24, now), approvedBy: null, approvedAt: null, declinedBy: null, declinedAt: null, expiredReason: null,
      createdAt: now, updatedAt: now,
    },
    {
      ...base, operatorId: op, type: 'waitlist', status: 'pending', locationId: loc,
      studentId: 'stu-103', prospectId: null, instructorId: 'inst-101', aircraftId: 'ac-103',
      proposedStart: daysFromNow(3, 8, 0, now), proposedEnd: daysFromNow(3, 10, 0, now),
      activityTypeId: 'at-001',
      rankingScore: '71.0000',
      rationale: { summary: 'Marcus Thompson rental waitlist. CFI Carlos Mendez and DA40 Star available.', inputs: {}, constraints: { instructorAvailable: true, aircraftAvailable: true, studentAvailable: true, withinCivilTwilight: true }, policies: {} },
      expiresAt: hoursFromNow(24, now), approvedBy: null, approvedAt: null, declinedBy: null, declinedAt: null, expiredReason: null,
      createdAt: now, updatedAt: now,
    },
    {
      ...base, operatorId: op, type: 'discovery', status: 'pending', locationId: loc,
      studentId: null, prospectId: prospectId, instructorId: 'inst-101', aircraftId: 'ac-101',
      proposedStart: daysFromNow(2, 10, 0, now), proposedEnd: daysFromNow(2, 11, 0, now),
      activityTypeId: 'at-003',
      rankingScore: '60.0000',
      rationale: { summary: 'Tom Baker requested a discovery flight at KSQL. CFI Carlos Mendez and N738JV available.', inputs: { prospectName: 'Tom Baker' }, constraints: { instructorAvailable: true, aircraftAvailable: true, withinCivilTwilight: true }, policies: {} },
      expiresAt: hoursFromNow(48, now), approvedBy: null, approvedAt: null, declinedBy: null, declinedAt: null, expiredReason: null,
      createdAt: now, updatedAt: now,
    },
    {
      ...base, operatorId: op, type: 'waitlist', status: 'approved', locationId: loc,
      studentId: 'stu-101', prospectId: null, instructorId: 'inst-101', aircraftId: 'ac-101',
      proposedStart: daysFromNow(0, 13, 0, now), proposedEnd: daysFromNow(0, 15, 0, now),
      activityTypeId: 'at-001', courseId: 'crs-ppl', lessonId: 'ppl-les-009', enrollmentId: 'enr-101',
      rankingScore: '91.0000',
      rationale: { summary: 'Daniel Okafor filled afternoon slot. Approved by scheduler.', inputs: {}, constraints: { instructorAvailable: true, aircraftAvailable: true, studentAvailable: true, withinCivilTwilight: true }, policies: {} },
      expiresAt: hoursFromNow(18, now), approvedBy: 'usr-101', approvedAt: hoursFromNow(-3, now), declinedBy: null, declinedAt: null, expiredReason: null,
      fspReservationId: 'fsp-res-5001',
      createdAt: hoursFromNow(-5, now), updatedAt: hoursFromNow(-3, now),
    },
    {
      ...base, operatorId: op, type: 'reschedule', status: 'declined', locationId: loc,
      studentId: 'stu-103', prospectId: null, instructorId: 'inst-102', aircraftId: 'ac-102',
      proposedStart: daysFromNow(1, 10, 0, now), proposedEnd: daysFromNow(1, 12, 0, now),
      activityTypeId: 'at-001',
      rankingScore: '55.0000',
      rationale: { summary: 'Marcus Thompson reschedule declined — student unavailable that day.', inputs: { rescheduleReason: 'student_request' }, constraints: { instructorAvailable: true, aircraftAvailable: true, studentAvailable: false, withinCivilTwilight: true }, policies: {} },
      expiresAt: hoursFromNow(12, now), approvedBy: null, approvedAt: null, declinedBy: 'usr-101', declinedAt: hoursFromNow(-1, now), expiredReason: null,
      createdAt: hoursFromNow(-6, now), updatedAt: hoursFromNow(-1, now),
    },
  ];
}

// ─── Operator 1003: Pacific Coast Aviation ──────────────────────────────────
// 4 suggestions: 2 pending, 1 pending discovery, 1 approved

function buildOperator1003Suggestions(now: Date, prospectId: string): SuggestionInsert[] {
  const op = 1003;
  const loc = 'loc-201';
  const base = {
    fspReservationId: null, fspValidationErrors: null,
    courseId: null, lessonId: null, enrollmentId: null, groupId: null,
  };

  return [
    {
      ...base, operatorId: op, type: 'waitlist', status: 'pending', locationId: loc,
      studentId: 'stu-201', prospectId: null, instructorId: 'inst-201', aircraftId: 'ac-201',
      proposedStart: daysFromNow(1, 8, 0, now), proposedEnd: daysFromNow(1, 10, 0, now),
      activityTypeId: 'at-001', courseId: 'crs-ppl', lessonId: 'ppl-les-005', enrollmentId: 'enr-201',
      rankingScore: '85.0000',
      rationale: { summary: 'Aisha Patel can fill morning slot at Hayward. CFI Kevin Tanaka and N921PC available.', inputs: {}, constraints: { instructorAvailable: true, aircraftAvailable: true, studentAvailable: true, withinCivilTwilight: true }, policies: {} },
      expiresAt: hoursFromNow(24, now), approvedBy: null, approvedAt: null, declinedBy: null, declinedAt: null, expiredReason: null,
      createdAt: now, updatedAt: now,
    },
    {
      ...base, operatorId: op, type: 'next_lesson', status: 'pending', locationId: loc,
      studentId: 'stu-202', prospectId: null, instructorId: 'inst-201', aircraftId: 'ac-202',
      proposedStart: daysFromNow(2, 14, 0, now), proposedEnd: daysFromNow(2, 16, 0, now),
      activityTypeId: 'at-001',
      rankingScore: '72.0000',
      rationale: { summary: 'Brian Larsen next lesson due. CFI Kevin Tanaka and N340PC available.', inputs: { daysSinceLastLesson: 5 }, constraints: { instructorAvailable: true, aircraftAvailable: true, studentAvailable: true, withinCivilTwilight: true }, policies: {} },
      expiresAt: hoursFromNow(24, now), approvedBy: null, approvedAt: null, declinedBy: null, declinedAt: null, expiredReason: null,
      createdAt: now, updatedAt: now,
    },
    {
      ...base, operatorId: op, type: 'discovery', status: 'pending', locationId: loc,
      studentId: null, prospectId: prospectId, instructorId: 'inst-201', aircraftId: 'ac-201',
      proposedStart: daysFromNow(3, 10, 0, now), proposedEnd: daysFromNow(3, 11, 0, now),
      activityTypeId: 'at-003',
      rankingScore: '58.0000',
      rationale: { summary: 'Lisa Chang requested a discovery flight at Hayward. CFI Kevin Tanaka and N921PC available.', inputs: { prospectName: 'Lisa Chang' }, constraints: { instructorAvailable: true, aircraftAvailable: true, withinCivilTwilight: true }, policies: {} },
      expiresAt: hoursFromNow(48, now), approvedBy: null, approvedAt: null, declinedBy: null, declinedAt: null, expiredReason: null,
      createdAt: now, updatedAt: now,
    },
    {
      ...base, operatorId: op, type: 'waitlist', status: 'approved', locationId: loc,
      studentId: 'stu-201', prospectId: null, instructorId: 'inst-201', aircraftId: 'ac-201',
      proposedStart: daysFromNow(0, 10, 0, now), proposedEnd: daysFromNow(0, 12, 0, now),
      activityTypeId: 'at-001', courseId: 'crs-ppl', lessonId: 'ppl-les-004', enrollmentId: 'enr-201',
      rankingScore: '90.0000',
      rationale: { summary: 'Aisha Patel filled morning slot. Approved by scheduler.', inputs: {}, constraints: { instructorAvailable: true, aircraftAvailable: true, studentAvailable: true, withinCivilTwilight: true }, policies: {} },
      expiresAt: hoursFromNow(18, now), approvedBy: 'usr-201', approvedAt: hoursFromNow(-2, now), declinedBy: null, declinedAt: null, expiredReason: null,
      fspReservationId: 'fsp-res-6001',
      createdAt: hoursFromNow(-4, now), updatedAt: hoursFromNow(-2, now),
    },
  ];
}
