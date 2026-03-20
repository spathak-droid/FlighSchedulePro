/**
 * Reservations & Solver Controller.
 *
 * Provides endpoints for:
 * - Solver operations (find-time, optimize)
 * - Reservation CRUD (list, detail, cancel, batch create)
 * - Cancellation reason lookup
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { db } from '../../../db/index.js';
import {
  reservationHistory,
  cancellationReasons,
  students,
  instructors,
  aircraft,
  activityTypes,
  suggestions,
} from '../../../db/schema/index.js';
import { eq, and, gte, lte, sql, desc, inArray } from 'drizzle-orm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ScheduleSolverService } from './schedule-solver.service.js';
import type { FindTimeQuery } from './schedule-solver.service.js';
import type { AuthenticatedRequest } from '../../common/interfaces/index.js';

interface FindTimeBody {
  studentId: string;
  activityTypeId: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  preferredInstructorId?: string;
  preferredAircraftId?: string;
  durationMinutes: number;
}

interface OptimizeBody {
  date: string; // YYYY-MM-DD
}

interface BatchCreateBody {
  suggestionIds: string[];
}

interface CancelBody {
  reasonId?: string;
  reason?: string;
}

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller()
export class ReservationsController {
  constructor(
    private readonly solverService: ScheduleSolverService,
    @InjectQueue('generate-suggestions') private readonly suggestionsQueue: Queue,
  ) {}

  // ── Solver endpoints ─────────────────────────────────────────────────────

  /**
   * POST /api/v1/solver/find-time
   *
   * Find available time slots for a student + activity using the constraint solver.
   */
  @Post('solver/find-time')
  @HttpCode(HttpStatus.OK)
  async findTime(@Req() req: AuthenticatedRequest, @Body() body: FindTimeBody) {
    if (!body.studentId || !body.activityTypeId || !body.dateRangeStart || !body.dateRangeEnd) {
      throw new BadRequestException(
        'studentId, activityTypeId, dateRangeStart, and dateRangeEnd are required',
      );
    }

    if (!body.durationMinutes || body.durationMinutes < 30 || body.durationMinutes > 480) {
      throw new BadRequestException('durationMinutes must be between 30 and 480');
    }

    const query: FindTimeQuery = {
      studentId: body.studentId,
      activityTypeId: body.activityTypeId,
      dateRangeStart: body.dateRangeStart,
      dateRangeEnd: body.dateRangeEnd,
      preferredInstructorId: body.preferredInstructorId,
      preferredAircraftId: body.preferredAircraftId,
      durationMinutes: body.durationMinutes,
    };

    // Pass empty fspToken for mock mode — enables per-instructor availability
    const slots = await this.solverService.findTime(req.user.operatorId, query, '');

    return {
      data: slots.map((s) => ({
        start: s.start.toISOString(),
        end: s.end.toISOString(),
        instructorId: s.instructorId,
        instructorName: s.instructorName,
        aircraftId: s.aircraftId,
        aircraftRegistration: s.aircraftRegistration,
        matchScore: s.matchScore,
      })),
    };
  }

  /**
   * POST /api/v1/solver/optimize
   *
   * Analyze a day's utilization and get optimization suggestions.
   */
  @Post('solver/optimize')
  @HttpCode(HttpStatus.OK)
  async optimizeDay(@Req() req: AuthenticatedRequest, @Body() body: OptimizeBody) {
    if (!body.date) {
      throw new BadRequestException('date is required (YYYY-MM-DD format)');
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      throw new BadRequestException('date must be in YYYY-MM-DD format');
    }

    const result = await this.solverService.optimizeDay(req.user.operatorId, body.date);

    return { data: result };
  }

  // ── Reservation endpoints ────────────────────────────────────────────────

  /**
   * POST /api/v1/reservations/batch
   *
   * Create multiple reservations from approved suggestion IDs.
   */
  @Post('reservations/batch')
  @HttpCode(HttpStatus.CREATED)
  async batchCreate(@Req() req: AuthenticatedRequest, @Body() body: BatchCreateBody) {
    if (
      !body.suggestionIds ||
      !Array.isArray(body.suggestionIds) ||
      body.suggestionIds.length === 0
    ) {
      throw new BadRequestException('suggestionIds must be a non-empty array of UUIDs');
    }

    const result = await this.solverService.batchCreateReservations(
      req.user.operatorId,
      body.suggestionIds,
    );

    return { data: result };
  }

  /**
   * GET /api/v1/reservations
   *
   * List reservations with optional filters.
   * Query params: dateFrom, dateTo, studentId, instructorId, aircraftId, status, page, pageSize
   */
  @Get('reservations')
  async listReservations(
    @Req() req: AuthenticatedRequest,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('studentId') studentId?: string,
    @Query('instructorId') instructorId?: string,
    @Query('aircraftId') aircraftId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const operatorId = req.user.operatorId;
    const pageNum = Math.max(1, parseInt(page ?? '1', 10));
    const size = Math.min(100, Math.max(1, parseInt(pageSize ?? '20', 10)));
    const offset = (pageNum - 1) * size;

    // Build dynamic conditions
    const conditions = [eq(reservationHistory.operatorId, operatorId)];

    if (dateFrom) {
      conditions.push(gte(reservationHistory.startTime, new Date(dateFrom)));
    }
    if (dateTo) {
      conditions.push(lte(reservationHistory.startTime, new Date(dateTo)));
    }
    if (studentId) {
      conditions.push(eq(reservationHistory.studentId, studentId));
    }
    if (instructorId) {
      conditions.push(eq(reservationHistory.instructorId, instructorId));
    }
    if (aircraftId) {
      conditions.push(eq(reservationHistory.aircraftId, aircraftId));
    }
    if (status) {
      conditions.push(eq(reservationHistory.status, status));
    }

    const whereClause = and(...conditions);

    // Count query
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reservationHistory)
      .where(whereClause);

    const total = countResult?.count ?? 0;

    // Data query
    const rows = await db
      .select()
      .from(reservationHistory)
      .where(whereClause)
      .orderBy(desc(reservationHistory.startTime))
      .limit(size)
      .offset(offset);

    // Enrich with names
    const studentIds = [...new Set(rows.map((r) => r.studentId).filter(Boolean))];
    const instructorIds = [...new Set(rows.map((r) => r.instructorId).filter(Boolean))] as string[];
    const aircraftIds = [...new Set(rows.map((r) => r.aircraftId).filter(Boolean))] as string[];
    const atIds = [...new Set(rows.map((r) => r.activityTypeId).filter(Boolean))] as string[];

    const [stuRows, instRows, acRows, atRows] = await Promise.all([
      studentIds.length > 0
        ? db
            .select({ id: students.id, firstName: students.firstName, lastName: students.lastName })
            .from(students)
            .where(inArray(students.id, studentIds))
        : [],
      instructorIds.length > 0
        ? db
            .select({
              id: instructors.id,
              firstName: instructors.firstName,
              lastName: instructors.lastName,
            })
            .from(instructors)
            .where(inArray(instructors.id, instructorIds))
        : [],
      aircraftIds.length > 0
        ? db
            .select({ id: aircraft.id, registration: aircraft.registration })
            .from(aircraft)
            .where(inArray(aircraft.id, aircraftIds))
        : [],
      atIds.length > 0
        ? db
            .select({ id: activityTypes.id, name: activityTypes.name })
            .from(activityTypes)
            .where(inArray(activityTypes.id, atIds))
        : [],
    ]);

    const stuMap = new Map(stuRows.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));
    const instMap = new Map(instRows.map((i) => [i.id, `${i.firstName} ${i.lastName}`]));
    const acMap = new Map(acRows.map((a) => [a.id, a.registration]));
    const atMap = new Map(atRows.map((a) => [a.id, a.name]));

    // Look up suggestion source for each reservation
    const resIds = rows.map((r) => r.id);
    const sourceRows =
      resIds.length > 0
        ? await db
            .select({
              fspReservationId: suggestions.fspReservationId,
              type: suggestions.type,
              approvedBy: suggestions.approvedBy,
            })
            .from(suggestions)
            .where(
              and(
                eq(suggestions.operatorId, operatorId),
                eq(suggestions.status, 'approved'),
                inArray(suggestions.fspReservationId, resIds),
              ),
            )
        : [];
    const sourceMap = new Map(
      sourceRows.map((s) => [s.fspReservationId, { type: s.type, approvedBy: s.approvedBy }]),
    );

    const enriched = rows.map((r) => {
      const source = sourceMap.get(r.id);
      return {
        ...r,
        studentName: r.studentId?.startsWith('prospect:')
          ? r.studentId.slice(9)
          : (stuMap.get(r.studentId) ?? null),
        instructorName: instMap.get(r.instructorId ?? '') ?? null,
        aircraftRegistration: acMap.get(r.aircraftId ?? '') ?? null,
        activityTypeName: atMap.get(r.activityTypeId ?? '') ?? null,
        source: source?.type ?? 'manual',
        approvedBy: source?.approvedBy ?? null,
      };
    });

    return {
      data: enriched,
      pagination: {
        page: pageNum,
        pageSize: size,
        total,
        totalPages: Math.ceil(total / size),
      },
    };
  }

  /**
   * GET /api/v1/reservations/:id
   *
   * Get a single reservation by ID.
   */
  @Get('reservations/:id')
  async getReservation(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    const [row] = await db
      .select()
      .from(reservationHistory)
      .where(
        and(eq(reservationHistory.id, id), eq(reservationHistory.operatorId, req.user.operatorId)),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Reservation ${id} not found`);
    }

    return { data: row };
  }

  /**
   * DELETE /api/v1/reservations/:id
   *
   * Cancel a reservation with an optional reason.
   */
  @Delete('reservations/:id')
  @HttpCode(HttpStatus.OK)
  async cancelReservation(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body?: CancelBody,
  ) {
    const operatorId = req.user.operatorId;

    // Verify reservation exists
    const [existing] = await db
      .select()
      .from(reservationHistory)
      .where(and(eq(reservationHistory.id, id), eq(reservationHistory.operatorId, operatorId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Reservation ${id} not found`);
    }

    if (existing.status === 'cancelled') {
      throw new BadRequestException('Reservation is already cancelled');
    }

    // Resolve cancellation reason name if reasonId provided
    let reasonText = body?.reason ?? 'Cancelled by scheduler';
    if (body?.reasonId) {
      const [reasonRecord] = await db
        .select()
        .from(cancellationReasons)
        .where(
          and(
            eq(cancellationReasons.id, body.reasonId),
            eq(cancellationReasons.operatorId, operatorId),
          ),
        )
        .limit(1);

      if (reasonRecord) {
        reasonText = reasonRecord.name;
      }
    }

    // Update status to cancelled
    const [updated] = await db
      .update(reservationHistory)
      .set({ status: 'cancelled' })
      .where(eq(reservationHistory.id, id))
      .returning();

    // Enqueue suggestion generation for the freed slot
    await this.suggestionsQueue
      .add(
        `cancel-${operatorId}-${id}-${Date.now()}`,
        {
          operatorId,
          openings: [
            {
              start: existing.startTime?.toISOString() ?? new Date().toISOString(),
              end: existing.endTime?.toISOString() ?? new Date().toISOString(),
              locationId: existing.locationId ?? 'unknown',
              type: 'cancellation' as const,
              previousReservation: {
                studentId: existing.studentId,
                activityTypeId: existing.activityTypeId ?? '',
                instructorId: existing.instructorId ?? undefined,
                aircraftId: existing.aircraftId ?? undefined,
              },
            },
          ],
          detectedAt: new Date().toISOString(),
        },
        { attempts: 2, backoff: { type: 'exponential', delay: 3000 } },
      )
      .catch(() => {}); // Non-blocking — don't fail the cancel if queue is down

    return {
      data: {
        ...updated,
        cancellationReason: reasonText,
      },
    };
  }

  // ── Cancellation reasons ─────────────────────────────────────────────────

  /**
   * GET /api/v1/cancellation-reasons
   *
   * List active cancellation reasons for the operator.
   */
  @Get('cancellation-reasons')
  async listCancellationReasons(@Req() req: AuthenticatedRequest) {
    const rows = await db
      .select()
      .from(cancellationReasons)
      .where(
        and(
          eq(cancellationReasons.operatorId, req.user.operatorId),
          eq(cancellationReasons.isActive, true),
        ),
      )
      .orderBy(cancellationReasons.name);

    return { data: rows };
  }
}
