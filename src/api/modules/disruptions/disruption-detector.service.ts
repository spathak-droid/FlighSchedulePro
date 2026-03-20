import { Injectable, Logger } from '@nestjs/common';
import { db } from '../../../db/index.js';
import { disruptionEvents } from '../../../db/schema/index.js';
import { reservationHistory } from '../../../db/schema/index.js';
import { aircraft } from '../../../db/schema/index.js';
import { WeatherService } from '../weather/weather.service.js';
import { FspResourceService } from '../../fsp/fsp-resource.service.js';
import { getLocationsForOperator } from '../../fsp/mock/mock-data.js';
import { eq, and, gt, ne, sql, inArray } from 'drizzle-orm';

// ─── Types ──────────────────────────────────────────────────────────────────

export type DisruptionType = 'weather' | 'maintenance' | 'instructor';
export type DisruptionSeverity = 'warning' | 'critical' | 'grounded';

export interface DisruptionEvent {
  id: string;
  operatorId: number;
  type: DisruptionType;
  severity: DisruptionSeverity;
  title: string;
  description: string | null;
  affectedReservationIds: string[];
  affectedStudentIds: string[];
  affectedAircraftIds: string[];
  locationId: string | null;
  detectedAt: Date;
  resolvedAt: Date | null;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface DisruptionScanResult {
  weather: DisruptionEvent[];
  maintenance: DisruptionEvent[];
  instructor: DisruptionEvent[];
}

// ─── Maintenance Limits ─────────────────────────────────────────────────────

interface AircraftMaintenanceData {
  hobbsHours: number;
  nextInspectionDue: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class DisruptionDetectorService {
  private readonly logger = new Logger(DisruptionDetectorService.name);

  constructor(
    private readonly weatherService: WeatherService,
    private readonly fspResourceService: FspResourceService,
  ) {}

  // ─── Weather Disruptions ────────────────────────────────────────────────

  /**
   * Detect weather disruptions for all locations of an operator.
   * If flight category is IFR or LIFR, creates a disruption event.
   */
  async detectWeatherDisruptions(operatorId: number, _token: string): Promise<DisruptionEvent[]> {
    const locations = getLocationsForOperator(operatorId);
    const disruptions: DisruptionEvent[] = [];
    const now = new Date();

    for (const location of locations) {
      if (location.latitude == null || location.longitude == null) {
        continue;
      }

      try {
        const weather = await this.weatherService.fetchCurrentWeather(
          location.latitude,
          location.longitude,
        );

        const category = weather.flightCategory;

        if (category === 'IFR' || category === 'LIFR') {
          const severity: DisruptionSeverity = category === 'LIFR' ? 'grounded' : 'critical';

          // Find upcoming reservations at this location
          const upcomingReservations = await db
            .select({
              id: reservationHistory.id,
              studentId: reservationHistory.studentId,
              aircraftId: reservationHistory.aircraftId,
            })
            .from(reservationHistory)
            .where(
              and(
                eq(reservationHistory.operatorId, operatorId),
                eq(reservationHistory.locationId, location.id),
                gt(reservationHistory.startTime, now),
                ne(reservationHistory.status, 'cancelled'),
              ),
            );

          const reservationIds = upcomingReservations.map((r) => r.id);
          const studentIds = [...new Set(upcomingReservations.map((r) => r.studentId))];
          const aircraftIds = [
            ...new Set(
              upcomingReservations
                .map((r) => r.aircraftId)
                .filter((id): id is string => id != null),
            ),
          ];

          disruptions.push({
            id: '', // Will be assigned on insert
            operatorId,
            type: 'weather',
            severity,
            title: `${category} conditions at ${location.code}`,
            description:
              `Flight category ${category} detected at ${location.name}. ` +
              `Visibility: ${weather.visibility}sm, Cloud cover: ${weather.cloudCover}%, ` +
              `Wind: ${weather.windSpeed}km/h gusting ${weather.windGust}km/h. ` +
              `${reservationIds.length} upcoming reservation(s) may be affected.`,
            affectedReservationIds: reservationIds,
            affectedStudentIds: studentIds,
            affectedAircraftIds: aircraftIds,
            locationId: location.id,
            detectedAt: now,
            resolvedAt: null,
            isActive: true,
            metadata: {
              flightCategory: category,
              visibility: weather.visibility,
              cloudCover: weather.cloudCover,
              windSpeed: weather.windSpeed,
              windGust: weather.windGust,
              temperature: weather.temperature,
              locationCode: location.code,
            },
            createdAt: now,
          });

          this.logger.warn(
            `Weather disruption detected at ${location.code}: ${category} ` +
              `(vis ${weather.visibility}sm, clouds ${weather.cloudCover}%) — ` +
              `${reservationIds.length} reservations affected`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to check weather for ${location.code}: ${(error as Error).message}`,
        );
      }
    }

    return disruptions;
  }

  // ─── Maintenance Disruptions ────────────────────────────────────────────

  /**
   * Detect aircraft approaching 100-hr inspection.
   * Warning if < 50h remaining, critical if < 20h remaining.
   */
  async detectMaintenanceDisruptions(operatorId: number): Promise<DisruptionEvent[]> {
    const now = new Date();
    const disruptions: DisruptionEvent[] = [];

    // Get active aircraft for this operator
    const operatorAircraft = await db
      .select()
      .from(aircraft)
      .where(and(eq(aircraft.operatorId, operatorId), eq(aircraft.isActive, true)));

    for (const ac of operatorAircraft) {
      // Fetch real maintenance data from FSP API
      let maintenanceData: AircraftMaintenanceData | null = null;
      try {
        const times = await this.fspResourceService.getAircraftTimes(operatorId, ac.id, '');
        const reminders = await this.fspResourceService.getMaintenanceReminders(
          operatorId,
          ac.id,
          '',
        );

        const hobbsHours = ((times as Record<string, unknown>)?.totalHobbs as number) ?? 0;
        // Find next 100-hr inspection from reminders, or estimate it
        const inspectionReminder = Array.isArray(reminders)
          ? reminders.find((r) =>
              String(
                (r as Record<string, unknown>).name ?? (r as Record<string, unknown>).type ?? '',
              )
                .toLowerCase()
                .includes('100'),
            )
          : null;
        const nextInspectionDue = inspectionReminder
          ? (((inspectionReminder as Record<string, unknown>).dueHobbs as number) ??
            hobbsHours + 100)
          : Math.ceil(hobbsHours / 100) * 100;

        maintenanceData = { hobbsHours, nextInspectionDue };
      } catch {
        this.logger.debug(
          `Could not fetch maintenance data for ${ac.registration ?? ac.id} — skipping`,
        );
        continue;
      }

      const remainingHours = maintenanceData.nextInspectionDue - maintenanceData.hobbsHours;

      if (remainingHours >= 50) {
        continue; // No disruption needed
      }

      const severity: DisruptionSeverity = remainingHours < 20 ? 'critical' : 'warning';

      // Find upcoming reservations using this aircraft
      const upcomingReservations = await db
        .select({
          id: reservationHistory.id,
          studentId: reservationHistory.studentId,
        })
        .from(reservationHistory)
        .where(
          and(
            eq(reservationHistory.operatorId, operatorId),
            eq(reservationHistory.aircraftId, ac.id),
            gt(reservationHistory.startTime, now),
            ne(reservationHistory.status, 'cancelled'),
          ),
        );

      const reservationIds = upcomingReservations.map((r) => r.id);
      const studentIds = [...new Set(upcomingReservations.map((r) => r.studentId))];

      disruptions.push({
        id: '',
        operatorId,
        type: 'maintenance',
        severity,
        title: `${ac.registration} approaching 100-hr inspection`,
        description:
          `Aircraft ${ac.registration} (${ac.makeModel ?? ac.id}) has ${remainingHours.toFixed(1)}h remaining ` +
          `before 100-hour inspection is due. Current hobbs: ${maintenanceData.hobbsHours}h, ` +
          `due at ${maintenanceData.nextInspectionDue}h. ` +
          `${reservationIds.length} upcoming reservation(s) may need to be reassigned.`,
        affectedReservationIds: reservationIds,
        affectedStudentIds: studentIds,
        affectedAircraftIds: [ac.id],
        locationId: null,
        detectedAt: now,
        resolvedAt: null,
        isActive: true,
        metadata: {
          aircraftId: ac.id,
          registration: ac.registration,
          currentHobbs: maintenanceData.hobbsHours,
          inspectionDue: maintenanceData.nextInspectionDue,
          remainingHours,
        },
        createdAt: now,
      });

      this.logger.warn(
        `Maintenance disruption: ${ac.registration} has ${remainingHours.toFixed(1)}h remaining — severity: ${severity}`,
      );
    }

    return disruptions;
  }

  // ─── Instructor Disruptions ─────────────────────────────────────────────

  /**
   * Detect instructor disruptions:
   * 1. Overloaded instructors (> 6 flights in a single day)
   * 2. Instructors with >75% utilization (from reservation data)
   */
  async detectInstructorDisruptions(operatorId: number): Promise<DisruptionEvent[]> {
    const now = new Date();
    const disruptions: DisruptionEvent[] = [];

    // Get today's date boundaries
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Query upcoming reservations grouped by instructor for today
    const todayReservations = await db
      .select({
        id: reservationHistory.id,
        instructorId: reservationHistory.instructorId,
        studentId: reservationHistory.studentId,
        aircraftId: reservationHistory.aircraftId,
      })
      .from(reservationHistory)
      .where(
        and(
          eq(reservationHistory.operatorId, operatorId),
          gt(reservationHistory.startTime, todayStart),
          sql`${reservationHistory.startTime} < ${todayEnd}`,
          ne(reservationHistory.status, 'cancelled'),
        ),
      );

    // Group by instructor
    const instructorFlights = new Map<string, typeof todayReservations>();
    for (const res of todayReservations) {
      if (!res.instructorId) continue;
      const existing = instructorFlights.get(res.instructorId) ?? [];
      existing.push(res);
      instructorFlights.set(res.instructorId, existing);
    }

    for (const [instructorId, flights] of instructorFlights) {
      if (flights.length <= 6) continue;

      const reservationIds = flights.map((f) => f.id);
      const studentIds = [...new Set(flights.map((f) => f.studentId))];
      const aircraftIds = [
        ...new Set(flights.map((f) => f.aircraftId).filter((id): id is string => id != null)),
      ];

      disruptions.push({
        id: '',
        operatorId,
        type: 'instructor',
        severity: 'warning',
        title: `Instructor ${instructorId} overloaded (${flights.length} flights today)`,
        description:
          `Instructor ${instructorId} has ${flights.length} flights scheduled today, ` +
          `exceeding the recommended maximum of 6. This may impact flight quality and safety. ` +
          `Consider redistributing some flights to other instructors.`,
        affectedReservationIds: reservationIds,
        affectedStudentIds: studentIds,
        affectedAircraftIds: aircraftIds,
        locationId: null,
        detectedAt: now,
        resolvedAt: null,
        isActive: true,
        metadata: {
          instructorId,
          flightCount: flights.length,
          maxRecommended: 6,
        },
        createdAt: now,
      });

      this.logger.warn(
        `Instructor disruption: ${instructorId} has ${flights.length} flights today (max recommended: 6)`,
      );
    }

    // Also check utilization — instructors with >75% of available slots filled this week
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weekReservations = await db
      .select({
        instructorId: reservationHistory.instructorId,
        count: sql<number>`count(*)::int`,
      })
      .from(reservationHistory)
      .where(
        and(
          eq(reservationHistory.operatorId, operatorId),
          gt(reservationHistory.startTime, now),
          sql`${reservationHistory.startTime} < ${weekEnd}`,
          ne(reservationHistory.status, 'cancelled'),
        ),
      )
      .groupBy(reservationHistory.instructorId);

    // Assume ~8 slots/day * 5 days = 40 slots/week as max capacity
    const maxWeeklySlots = 40;
    const overloadedInstructors: string[] = [];
    for (const row of weekReservations) {
      if (!row.instructorId) continue;
      const utilization = row.count / maxWeeklySlots;
      if (utilization > 0.75) {
        overloadedInstructors.push(row.instructorId);
        disruptions.push({
          id: '',
          operatorId,
          type: 'instructor',
          severity: 'warning',
          title: `Instructor ${row.instructorId} at ${Math.round(utilization * 100)}% weekly utilization`,
          description:
            `${row.instructorId} has ${row.count} flights scheduled this week ` +
            `(${Math.round(utilization * 100)}% of estimated capacity). ` +
            `Consider redistributing flights to lighter-loaded instructors.`,
          affectedReservationIds: [],
          affectedStudentIds: [],
          affectedAircraftIds: [],
          locationId: null,
          detectedAt: now,
          resolvedAt: null,
          isActive: true,
          metadata: {
            instructorId: row.instructorId,
            weeklyFlights: row.count,
            utilization: Math.round(utilization * 100),
          },
          createdAt: now,
        });
      }
    }

    if (overloadedInstructors.length > 0) {
      const names = overloadedInstructors.join(', ');
      this.logger.warn(
        `${names} ${overloadedInstructors.length === 1 ? 'is' : 'are'} above 75% weekly utilization`,
      );
    }

    return disruptions;
  }

  // ─── Run All Checks ─────────────────────────────────────────────────────

  /**
   * Run all disruption detectors in parallel, deduplicate, and persist to DB.
   */
  async runAllChecks(operatorId: number, token: string): Promise<DisruptionScanResult> {
    this.logger.log(`Running all disruption checks for operator ${operatorId}`);

    const [weatherDisruptions, maintenanceDisruptions, instructorDisruptions] = await Promise.all([
      this.detectWeatherDisruptions(operatorId, token),
      this.detectMaintenanceDisruptions(operatorId),
      this.detectInstructorDisruptions(operatorId),
    ]);

    // Get existing active disruptions for deduplication
    const existingActive = await db
      .select({
        id: disruptionEvents.id,
        type: disruptionEvents.type,
        title: disruptionEvents.title,
        locationId: disruptionEvents.locationId,
        affectedAircraftIds: disruptionEvents.affectedAircraftIds,
        metadata: disruptionEvents.metadata,
      })
      .from(disruptionEvents)
      .where(and(eq(disruptionEvents.operatorId, operatorId), eq(disruptionEvents.isActive, true)));

    // Deduplicate: don't insert if an active disruption with same type+key exists
    const allNew = [...weatherDisruptions, ...maintenanceDisruptions, ...instructorDisruptions];

    const toInsert: typeof allNew = [];

    for (const disruption of allNew) {
      const isDuplicate = existingActive.some((existing) => {
        if (existing.type !== disruption.type) return false;

        switch (disruption.type) {
          case 'weather':
            return existing.locationId === disruption.locationId;
          case 'maintenance':
            return (
              Array.isArray(existing.affectedAircraftIds) &&
              Array.isArray(disruption.affectedAircraftIds) &&
              existing.affectedAircraftIds.length > 0 &&
              disruption.affectedAircraftIds.length > 0 &&
              existing.affectedAircraftIds[0] === disruption.affectedAircraftIds[0]
            );
          case 'instructor': {
            const existingMeta = existing.metadata as Record<string, unknown> | null;
            return (
              existingMeta?.instructorId ===
              (disruption.metadata as Record<string, unknown>)?.instructorId
            );
          }
          default:
            return false;
        }
      });

      if (!isDuplicate) {
        toInsert.push(disruption);
      }
    }

    // Persist new disruptions
    const insertedDisruptions: DisruptionEvent[] = [];

    if (toInsert.length > 0) {
      const inserted = await db
        .insert(disruptionEvents)
        .values(
          toInsert.map((d) => ({
            operatorId: d.operatorId,
            type: d.type,
            severity: d.severity,
            title: d.title,
            description: d.description,
            affectedReservationIds: d.affectedReservationIds,
            affectedStudentIds: d.affectedStudentIds,
            affectedAircraftIds: d.affectedAircraftIds,
            locationId: d.locationId,
            detectedAt: d.detectedAt,
            resolvedAt: d.resolvedAt,
            isActive: d.isActive,
            metadata: d.metadata,
          })),
        )
        .returning();

      for (const row of inserted) {
        insertedDisruptions.push({
          id: row.id,
          operatorId: row.operatorId,
          type: row.type as DisruptionType,
          severity: row.severity as DisruptionSeverity,
          title: row.title,
          description: row.description,
          affectedReservationIds: (row.affectedReservationIds as string[]) ?? [],
          affectedStudentIds: (row.affectedStudentIds as string[]) ?? [],
          affectedAircraftIds: (row.affectedAircraftIds as string[]) ?? [],
          locationId: row.locationId,
          detectedAt: row.detectedAt,
          resolvedAt: row.resolvedAt,
          isActive: row.isActive,
          metadata: (row.metadata as Record<string, unknown>) ?? {},
          createdAt: row.createdAt,
        });
      }

      this.logger.log(
        `Inserted ${inserted.length} new disruption event(s) for operator ${operatorId}`,
      );
    }

    // Return all disruptions (existing + new) by type
    const allActive = await this.getActiveDisruptions(operatorId);

    return {
      weather: allActive.filter((d) => d.type === 'weather'),
      maintenance: allActive.filter((d) => d.type === 'maintenance'),
      instructor: allActive.filter((d) => d.type === 'instructor'),
    };
  }

  // ─── Query Methods ──────────────────────────────────────────────────────

  /**
   * Get all active disruptions for an operator.
   */
  async getActiveDisruptions(operatorId: number): Promise<DisruptionEvent[]> {
    const rows = await db
      .select()
      .from(disruptionEvents)
      .where(and(eq(disruptionEvents.operatorId, operatorId), eq(disruptionEvents.isActive, true)))
      .orderBy(disruptionEvents.detectedAt);

    return rows.map((row) => ({
      id: row.id,
      operatorId: row.operatorId,
      type: row.type as DisruptionType,
      severity: row.severity as DisruptionSeverity,
      title: row.title,
      description: row.description,
      affectedReservationIds: (row.affectedReservationIds as string[]) ?? [],
      affectedStudentIds: (row.affectedStudentIds as string[]) ?? [],
      affectedAircraftIds: (row.affectedAircraftIds as string[]) ?? [],
      locationId: row.locationId,
      detectedAt: row.detectedAt,
      resolvedAt: row.resolvedAt,
      isActive: row.isActive,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: row.createdAt,
    }));
  }

  /**
   * Resolve a disruption by ID.
   */
  async resolveDisruption(
    operatorId: number,
    disruptionId: string,
  ): Promise<DisruptionEvent | null> {
    const [updated] = await db
      .update(disruptionEvents)
      .set({
        isActive: false,
        resolvedAt: new Date(),
      })
      .where(
        and(
          eq(disruptionEvents.id, disruptionId),
          eq(disruptionEvents.operatorId, operatorId),
          eq(disruptionEvents.isActive, true),
        ),
      )
      .returning();

    if (!updated) {
      return null;
    }

    return {
      id: updated.id,
      operatorId: updated.operatorId,
      type: updated.type as DisruptionType,
      severity: updated.severity as DisruptionSeverity,
      title: updated.title,
      description: updated.description,
      affectedReservationIds: (updated.affectedReservationIds as string[]) ?? [],
      affectedStudentIds: (updated.affectedStudentIds as string[]) ?? [],
      affectedAircraftIds: (updated.affectedAircraftIds as string[]) ?? [],
      locationId: updated.locationId,
      detectedAt: updated.detectedAt,
      resolvedAt: updated.resolvedAt,
      isActive: updated.isActive,
      metadata: (updated.metadata as Record<string, unknown>) ?? {},
      createdAt: updated.createdAt,
    };
  }
}
