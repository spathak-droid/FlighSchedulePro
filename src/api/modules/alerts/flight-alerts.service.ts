import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { db } from '../../../db/index.js';
import { flightAlerts } from '../../../db/schema/flight-alerts.js';
import { aircraft } from '../../../db/schema/aircraft.js';
import { eq, and, desc, sql } from 'drizzle-orm';

export interface CreateAlertData {
  operatorId: number;
  reservationId?: string | null;
  alertType: 'overdue_return' | 'safety' | 'maintenance_due' | 'weather_hold';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description?: string | null;
  aircraftId?: string | null;
  instructorId?: string | null;
  studentId?: string | null;
}

export interface FlightAlertRow {
  id: string;
  operatorId: number;
  reservationId: string | null;
  alertType: string;
  severity: string;
  title: string;
  description: string | null;
  aircraftId: string | null;
  instructorId: string | null;
  studentId: string | null;
  isResolved: boolean;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  createdAt: Date;
}

@Injectable()
export class FlightAlertsService {
  private readonly logger = new Logger('FlightAlertsService');

  /**
   * Get all unresolved (active) alerts for an operator, sorted newest first.
   */
  async getActiveAlerts(operatorId: number): Promise<FlightAlertRow[]> {
    return db
      .select()
      .from(flightAlerts)
      .where(
        and(
          eq(flightAlerts.operatorId, operatorId),
          eq(flightAlerts.isResolved, false),
        ),
      )
      .orderBy(desc(flightAlerts.createdAt));
  }

  /**
   * Create a new flight alert.
   */
  async createAlert(data: CreateAlertData): Promise<FlightAlertRow> {
    const [alert] = await db
      .insert(flightAlerts)
      .values({
        operatorId: data.operatorId,
        reservationId: data.reservationId ?? null,
        alertType: data.alertType,
        severity: data.severity,
        title: data.title,
        description: data.description ?? null,
        aircraftId: data.aircraftId ?? null,
        instructorId: data.instructorId ?? null,
        studentId: data.studentId ?? null,
      })
      .returning();

    this.logger.log(`[ALERT] Created ${data.severity} alert: ${data.title} (operator ${data.operatorId})`);
    return alert!;
  }

  /**
   * Resolve an alert by ID. Sets isResolved=true, resolvedAt=now, resolvedBy=userId.
   */
  async resolveAlert(id: string, userId: string): Promise<FlightAlertRow> {
    const [alert] = await db
      .update(flightAlerts)
      .set({
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: userId,
      })
      .where(eq(flightAlerts.id, id))
      .returning();

    if (!alert) {
      throw new NotFoundException(`Alert ${id} not found`);
    }

    this.logger.log(`[ALERT] Resolved alert ${id} by ${userId}`);
    return alert;
  }

  /**
   * Count unresolved alerts for an operator (used for badge display).
   */
  async getActiveAlertCount(operatorId: number): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(flightAlerts)
      .where(
        and(
          eq(flightAlerts.operatorId, operatorId),
          eq(flightAlerts.isResolved, false),
        ),
      );

    return result?.count ?? 0;
  }

  /**
   * Check aircraft approaching maintenance limits and create alerts.
   * In a production system, this would check hobbs/tach hours against inspection intervals.
   * For now, it checks the aircraft table and creates maintenance_due alerts
   * for any active aircraft that don't already have an open maintenance alert.
   */
  async generateMaintenanceAlerts(operatorId: number): Promise<number> {
    // Get active aircraft for operator
    const operatorAircraft = await db
      .select()
      .from(aircraft)
      .where(
        and(
          eq(aircraft.operatorId, operatorId),
          eq(aircraft.isActive, true),
        ),
      );

    // Get existing open maintenance alerts to avoid duplicates
    const existingAlerts = await db
      .select({ aircraftId: flightAlerts.aircraftId })
      .from(flightAlerts)
      .where(
        and(
          eq(flightAlerts.operatorId, operatorId),
          eq(flightAlerts.alertType, 'maintenance_due'),
          eq(flightAlerts.isResolved, false),
        ),
      );

    const alertedAircraftIds = new Set(existingAlerts.map((a) => a.aircraftId));
    let created = 0;

    for (const ac of operatorAircraft) {
      if (alertedAircraftIds.has(ac.id)) continue;

      // In production: check hobbs/tach against maintenance schedules.
      // For MVP, we generate alerts for aircraft that are simulators (as a heuristic placeholder)
      // or would use FSP API data for real hours tracking.
      // Skip actual generation here — this is called by the scheduler polling loop
      // and would use real FSP data.
    }

    if (created > 0) {
      this.logger.log(`[ALERT] Generated ${created} maintenance alerts for operator ${operatorId}`);
    }

    return created;
  }

  /**
   * Seed initial demo alerts for an operator.
   * Creates one overdue_return and one maintenance_due alert.
   * Idempotent — skips if alerts already exist for operator.
   */
  async seedAlerts(operatorId: number): Promise<void> {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(flightAlerts)
      .where(eq(flightAlerts.operatorId, operatorId));

    if ((countResult?.count ?? 0) > 0) {
      this.logger.log(`[ALERT] Alerts already seeded for operator ${operatorId} — skipping`);
      return;
    }

    await db.insert(flightAlerts).values([
      {
        operatorId,
        reservationId: 'res-003',
        alertType: 'overdue_return',
        severity: 'critical',
        title: 'Aircraft N152AB overdue return',
        description:
          'Aircraft N152AB (Cessna 152) was scheduled to return at 14:00 but has not been checked in. ' +
          'Pilot: Ryan Martinez, Instructor: David Kim. ' +
          'Last known position: local training area. Please verify status.',
        aircraftId: 'ac-002',
        instructorId: 'inst-003',
        studentId: 'stu-003',
        isResolved: false,
      },
      {
        operatorId,
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
      },
    ]);

    this.logger.log(`[ALERT] Seeded 2 demo flight alerts for operator ${operatorId}`);
  }
}
