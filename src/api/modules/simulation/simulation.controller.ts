import { Controller, Post, Get, HttpCode, HttpStatus, Req, Body } from '@nestjs/common';
import { SimulationService } from './simulation.service.js';
import type { AuthenticatedRequest } from '../../common/interfaces/index.js';
import { db } from '../../../db/index.js';
import { suggestions, auditEvents, reservationHistory } from '../../../db/schema/index.js';
import { eq, and, desc, sql, gte } from 'drizzle-orm';

interface StartBody {
  /** Event interval in seconds (default 20). */
  intervalSeconds?: number;
}

@Controller('simulation')
export class SimulationController {
  constructor(private readonly simulationService: SimulationService) {}

  /**
   * POST /api/v1/simulation/start
   * Start the flight school simulation for this operator.
   */
  @Post('start')
  @HttpCode(HttpStatus.OK)
  async start(@Req() req: AuthenticatedRequest, @Body() body: StartBody) {
    const intervalMs = Math.max(5, Math.min(body.intervalSeconds ?? 20, 120)) * 1000;
    const result = await this.simulationService.start(req.user.operatorId, intervalMs);
    return { data: result };
  }

  /**
   * POST /api/v1/simulation/stop
   * Stop the running simulation.
   */
  @Post('stop')
  @HttpCode(HttpStatus.OK)
  stop(@Req() req: AuthenticatedRequest) {
    const result = this.simulationService.stop(req.user.operatorId);
    return { data: result };
  }

  /**
   * GET /api/v1/simulation/status
   * Check if simulation is running and event stats.
   */
  @Get('status')
  status(@Req() req: AuthenticatedRequest) {
    const result = this.simulationService.getStatus(req.user.operatorId);
    return { data: result };
  }

  /**
   * GET /api/v1/simulation/pipeline
   * Returns live pipeline state for the automation flow visualization.
   * Shows suggestions at each stage + recent auto-approve decisions + reservations created.
   */
  @Get('pipeline')
  async pipeline(@Req() req: AuthenticatedRequest) {
    const operatorId = req.user.operatorId;
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Suggestion counts by status
    const statusCounts = await db
      .select({ status: suggestions.status, count: sql<number>`count(*)::int` })
      .from(suggestions)
      .where(eq(suggestions.operatorId, operatorId))
      .groupBy(suggestions.status);

    const counts: Record<string, number> = {};
    statusCounts.forEach((r) => { counts[r.status] = r.count; });

    // AI enrichment status of pending suggestions
    const [enrichedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(suggestions)
      .where(
        and(
          eq(suggestions.operatorId, operatorId),
          eq(suggestions.status, 'pending'),
          sql`${suggestions.rationale}->>'aiEnriched' = 'true'`,
        ),
      );

    const [notEnrichedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(suggestions)
      .where(
        and(
          eq(suggestions.operatorId, operatorId),
          eq(suggestions.status, 'pending'),
          sql`(${suggestions.rationale}->>'aiEnriched' IS NULL OR ${suggestions.rationale}->>'aiEnriched' != 'true')`,
        ),
      );

    // Risk breakdown of pending AI-enriched suggestions
    const riskBreakdown = await db
      .select({
        riskLevel: sql<string>`${suggestions.rationale}->>'riskLevel'`,
        count: sql<number>`count(*)::int`,
      })
      .from(suggestions)
      .where(
        and(
          eq(suggestions.operatorId, operatorId),
          eq(suggestions.status, 'pending'),
          sql`${suggestions.rationale}->>'aiEnriched' = 'true'`,
        ),
      )
      .groupBy(sql`${suggestions.rationale}->>'riskLevel'`);

    // Recent auto-approve events (last 5 min)
    const recentAutoEvents = await db
      .select({
        id: auditEvents.id,
        eventType: auditEvents.eventType,
        data: auditEvents.data,
        createdAt: auditEvents.createdAt,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.operatorId, operatorId),
          sql`${auditEvents.eventType} IN ('suggestion_auto_approved', 'suggestion_auto_approve_blocked')`,
          gte(auditEvents.createdAt, fiveMinAgo),
        ),
      )
      .orderBy(desc(auditEvents.createdAt))
      .limit(20);

    // Recent simulation events (last 5 min)
    const recentSimEvents = await db
      .select({
        id: auditEvents.id,
        eventType: auditEvents.eventType,
        data: auditEvents.data,
        createdAt: auditEvents.createdAt,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.operatorId, operatorId),
          sql`${auditEvents.eventType} IN ('flight_cancelled', 'student_no_show', 'maintenance_alert', 'instructor_unavailable', 'flight_completed', 'disruption_detected')`,
          gte(auditEvents.createdAt, fiveMinAgo),
        ),
      )
      .orderBy(desc(auditEvents.createdAt))
      .limit(20);

    // Recent reservations created (last 5 min)
    const recentReservations = await db
      .select({
        id: reservationHistory.id,
        studentId: reservationHistory.studentId,
        status: reservationHistory.status,
        startTime: reservationHistory.startTime,
        createdAt: reservationHistory.createdAt,
      })
      .from(reservationHistory)
      .where(
        and(
          eq(reservationHistory.operatorId, operatorId),
          gte(reservationHistory.createdAt, fiveMinAgo),
        ),
      )
      .orderBy(desc(reservationHistory.createdAt))
      .limit(10);

    return {
      data: {
        simulation: this.simulationService.getStatus(operatorId),
        pipeline: {
          pending: counts['pending'] ?? 0,
          approved: counts['approved'] ?? 0,
          declined: counts['declined'] ?? 0,
          expired: counts['expired'] ?? 0,
          processing: counts['processing'] ?? 0,
        },
        aiEnrichment: {
          enriched: enrichedCount?.count ?? 0,
          waiting: notEnrichedCount?.count ?? 0,
        },
        riskBreakdown: riskBreakdown.map((r) => ({
          level: r.riskLevel,
          count: r.count,
        })),
        recentAutoApprove: recentAutoEvents.map((e) => ({
          id: e.id,
          type: e.eventType,
          data: e.data as Record<string, unknown>,
          timestamp: e.createdAt.toISOString(),
        })),
        recentEvents: recentSimEvents.map((e) => ({
          id: e.id,
          type: e.eventType,
          data: e.data as Record<string, unknown>,
          timestamp: e.createdAt.toISOString(),
        })),
        recentReservations: recentReservations.map((r) => ({
          id: r.id,
          studentId: r.studentId,
          status: r.status,
          startTime: r.startTime.toISOString(),
          timestamp: r.createdAt.toISOString(),
        })),
      },
    };
  }
}
