/**
 * T079: Discovery Flight service.
 *
 * Manages the end-to-end flow for discovery flight booking:
 * 1. Create prospect record in DB
 * 2. Find available daylight-only slots using FSP
 * 3. Apply civil twilight constraint
 * 4. Create suggestion records linked to prospect (type='discovery')
 * 5. Return { prospect, suggestions }
 */

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { db } from '../../../db/index.js';
import { prospects } from '../../../db/schema/prospects.js';
import { suggestions } from '../../../db/schema/suggestions.js';
import { reservationHistory } from '../../../db/schema/reservation-history.js';
import { instructors } from '../../../db/schema/instructors.js';
import { aircraft } from '../../../db/schema/aircraft.js';
import { activityTypes } from '../../../db/schema/activity-types.js';
import { schedulingPolicies } from '../../../db/schema/scheduling-policies.js';
import { eq, and } from 'drizzle-orm';
import { FspResourceService } from '../../fsp/fsp-resource.service.js';
import { FspScheduleService } from '../../fsp/fsp-schedule.service.js';
import { AuditService } from '../activity/audit.service.js';
import { NotificationService } from '../notifications/notification.service.js';
import { ScheduleSolverService } from '../solver/schedule-solver.service.js';
import { filterDaylightSlots } from '../../../core/scheduling/constraint-evaluator.js';
import { buildRationale } from '../../../core/scheduling/rationale-builder.js';
import { getLocalParts } from '../../../core/utils/time.js';
import type { FoundSlot } from '../../../core/scheduling/slot-finder.js';
import type { FspCivilTwilight } from '../../fsp/fsp.types.js';

// ─── DTOs ───────────────────────────────────────────────────────────────────

export interface CreateDiscoveryRequestDto {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  preferredDates?: Array<{
    date: string;
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'anytime';
  }>;
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'anytime';
  notes?: string;
}

export interface DiscoveryResult {
  prospect: {
    id: string;
    firstName: string;
    lastName: string;
    status: string;
  };
  isAlternative?: boolean;
  preferredDate?: string | null;
  suggestions: Array<{
    id: string;
    proposedStart: Date;
    proposedEnd: Date;
    instructorId: string | null;
    aircraftId: string | null;
    rankingScore: string | null;
    instructorName: string | null;
    aircraftRegistration: string | null;
  }>;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  /** Default discovery flight duration in minutes. */
  private static readonly DISCOVERY_FLIGHT_DURATION = 60;

  /** Default discovery flight activity type name (used for lookup). */
  private static readonly DISCOVERY_ACTIVITY_KEYWORD = 'discovery';

  constructor(
    private readonly fspResourceService: FspResourceService,
    private readonly fspScheduleService: FspScheduleService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    private readonly solverService: ScheduleSolverService,
  ) {}

  /**
   * Create a discovery flight request:
   * 1. Create prospect in DB
   * 2. Find daylight-only available slots
   * 3. Create discovery suggestions
   * 4. Return prospect + suggestions
   */
  async createDiscoveryRequest(
    operatorId: number,
    data: CreateDiscoveryRequestDto,
    fspToken: string,
  ): Promise<DiscoveryResult> {
    // Validate input
    if (!data.firstName || !data.lastName) {
      throw new BadRequestException('firstName and lastName are required');
    }

    this.logger.log(
      `Creating discovery request for ${data.firstName} ${data.lastName} (operator ${operatorId})`,
    );

    // Step 1: Create prospect record
    const [prospect] = await db
      .insert(prospects)
      .values({
        operatorId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email ?? null,
        phone: data.phone ?? null,
        preferredDates: data.preferredDates ?? null,
        notes: data.notes ?? null,
        status: 'pending',
      })
      .returning();

    if (!prospect) {
      throw new Error('Failed to create prospect record');
    }

    await this.auditService.create({
      operatorId,
      eventType: 'prospect.created',
      entityType: 'prospect',
      entityId: prospect.id,
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
      },
    });

    // Step 2: Get operator's scheduling policy
    const [policy] = await db
      .select()
      .from(schedulingPolicies)
      .where(eq(schedulingPolicies.operatorId, operatorId))
      .limit(1);

    const ttlHours = policy?.suggestionTtlHours ?? 24;
    const maxSlots = policy?.rescheduleAlternativesCount ?? 5;

    // Step 3: Fetch resources for location + activity type resolution
    const [locationsResult, activityTypes] = await Promise.all([
      this.fspResourceService.getLocations(operatorId, fspToken),
      this.fspResourceService.getActivityTypes(operatorId, fspToken),
    ]);

    // Find the discovery flight activity type
    const discoveryActivity = activityTypes.find(
      (at) =>
        at.name.toLowerCase().includes(DiscoveryService.DISCOVERY_ACTIVITY_KEYWORD) && at.isActive,
    );
    const activityTypeId = discoveryActivity?.id ?? '';

    // Use first active location
    const location = locationsResult.find((l) => l.isActive);
    if (!location) {
      this.logger.warn(`No active locations for operator ${operatorId}`);
      return {
        prospect: {
          id: prospect.id,
          firstName: prospect.firstName,
          lastName: prospect.lastName,
          status: prospect.status,
        },
        suggestions: [],
      };
    }

    // Step 4: Get civil twilight for daylight constraint (still used as additional filter)
    let civilTwilight: FspCivilTwilight | null = null;
    try {
      civilTwilight = await this.fspResourceService.getCivilTwilight(
        operatorId,
        fspToken,
        location.id,
      );
    } catch (error) {
      this.logger.warn(
        `Could not fetch civil twilight for location ${location.id}: ${error instanceof Error ? error.message : error}`,
      );
    }

    // Step 5: Build search window from preferred dates (or default to next 28 days)
    const searchDays = policy?.searchWindowMaxDays ?? 28;
    const now = new Date();

    // Helper: format Date as YYYY-MM-DD in local time (avoids UTC shift from toISOString)
    const toLocalDateStr = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    // Parse preferred dates to determine search window
    // Compare using date strings to avoid UTC midnight vs local time issues
    const todayStr = toLocalDateStr(now);
    const parsedPreferredDates = (data.preferredDates ?? [])
      .filter((d) => d.date && d.date >= todayStr)
      .map((d) => d.date)
      .sort();

    let dateRangeStart: string;
    let dateRangeEnd: string;
    let preferredDateStr: string | null = null;

    if (parsedPreferredDates.length > 0) {
      // Search around preferred dates: from earliest preferred date to +7 days after latest
      const earliest = parsedPreferredDates[0]!;
      const latest = parsedPreferredDates[parsedPreferredDates.length - 1]!;
      const windowEnd = new Date(latest + 'T00:00:00');
      windowEnd.setDate(windowEnd.getDate() + 7);
      dateRangeStart = earliest;
      dateRangeEnd = toLocalDateStr(windowEnd);
      preferredDateStr = earliest;
    } else {
      dateRangeStart = todayStr;
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + searchDays);
      dateRangeEnd = toLocalDateStr(endDate);
    }

    // Use operator's location timezone for all time operations
    const operatorTimezone = location.timeZone || 'America/Los_Angeles';

    // Search for slots — if multiple preferred dates, search each individually
    // to avoid the solver's max results cap consuming all slots from the first date
    let slots: Awaited<ReturnType<typeof this.solverService.findTime>> = [];

    if (parsedPreferredDates.length > 1) {
      // Search each preferred date independently and combine results
      for (const prefDate of parsedPreferredDates) {
        const dateSlots = await this.solverService.findTime(
          operatorId,
          {
            studentId: '',
            activityTypeId,
            dateRangeStart: prefDate,
            dateRangeEnd: prefDate,
            durationMinutes: DiscoveryService.DISCOVERY_FLIGHT_DURATION,
          },
          fspToken,
          operatorTimezone,
        );
        slots.push(...dateSlots);
      }
    } else {
      slots = await this.solverService.findTime(
        operatorId,
        {
          studentId: '',
          activityTypeId,
          dateRangeStart,
          dateRangeEnd,
          durationMinutes: DiscoveryService.DISCOVERY_FLIGHT_DURATION,
        },
        fspToken,
        operatorTimezone,
      );
    }

    // Step 6: Apply civil twilight (daylight) constraint as additional filter
    if (civilTwilight) {
      slots = filterDaylightSlots(slots, civilTwilight, operatorTimezone);
    }

    // Apply preferred time-of-day filter if specified
    if (data.timeOfDay && data.timeOfDay !== 'anytime') {
      slots = this.filterByTimeOfDay(slots, data.timeOfDay, operatorTimezone);
    }

    // Separate slots that match ANY preferred date from alternatives
    let matchedSlots: typeof slots = slots;
    let isAlternative = false;
    const preferredDateSet = new Set(parsedPreferredDates);

    if (preferredDateSet.size > 0 && slots.length > 0) {
      const onPreferredDates = slots.filter((s) => preferredDateSet.has(toLocalDateStr(s.start)));
      if (onPreferredDates.length > 0) {
        matchedSlots = onPreferredDates;
      } else {
        // No slots on any preferred date — show alternatives with a flag
        matchedSlots = slots;
        isAlternative = true;
        this.logger.log(
          `No slots on preferred dates [${[...preferredDateSet].join(', ')}] — showing ${slots.length} alternatives`,
        );
      }
    }

    // If still no slots, expand search to full window
    if (matchedSlots.length === 0 && parsedPreferredDates.length > 0) {
      const fullEnd = new Date(now);
      fullEnd.setDate(fullEnd.getDate() + searchDays);
      matchedSlots = await this.solverService.findTime(
        operatorId,
        {
          studentId: '',
          activityTypeId,
          dateRangeStart: todayStr,
          dateRangeEnd: toLocalDateStr(fullEnd),
          durationMinutes: DiscoveryService.DISCOVERY_FLIGHT_DURATION,
        },
        fspToken,
        operatorTimezone,
      );
      if (civilTwilight) {
        matchedSlots = filterDaylightSlots(matchedSlots, civilTwilight, operatorTimezone);
      }
      if (data.timeOfDay && data.timeOfDay !== 'anytime') {
        matchedSlots = this.filterByTimeOfDay(matchedSlots, data.timeOfDay, operatorTimezone);
      }
      isAlternative = matchedSlots.length > 0;
    }

    // Limit to maxSlots
    slots = matchedSlots.slice(0, maxSlots);

    if (slots.length === 0) {
      this.logger.log(
        `No daylight-eligible slots found for discovery flight (operator ${operatorId})`,
      );
      return {
        prospect: {
          id: prospect.id,
          firstName: prospect.firstName,
          lastName: prospect.lastName,
          status: prospect.status,
        },
        suggestions: [],
      };
    }

    // Step 7: Deduplicate — one slot per time (pick highest-scored instructor)
    const slotsByTime = new Map<string, FoundSlot>();
    for (const slot of slots) {
      const key = slot.start.toISOString();
      const existing = slotsByTime.get(key);
      if (!existing || slot.matchScore > existing.matchScore) {
        slotsByTime.set(key, slot);
      }
    }
    const uniqueSlots = Array.from(slotsByTime.values());

    // Cap at configured max (already limited by maxSlots above)
    const cappedSlots = uniqueSlots.slice(0, maxSlots);

    // Create suggestion records
    const groupId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const suggestionRecords = cappedSlots.map((slot: FoundSlot) => {
      const rationale = buildRationale({
        rankingBreakdown: {
          daylightCompliance: 30,
          instructorAvailability: 20,
          aircraftAvailability: 20,
          matchScore: slot.matchScore,
        },
        constraintResults: civilTwilight
          ? [
              {
                passed: true,
                constraint: 'daylight_hours',
                details: 'Slot is within civil twilight boundaries',
                layer: 'regulatory' as const,
                hard: true,
              },
            ]
          : [],
        policyMatches: [
          'Discovery flight — daylight hours only',
          `Duration: ${DiscoveryService.DISCOVERY_FLIGHT_DURATION} minutes`,
        ],
        suggestionType: 'discovery',
      });

      return {
        operatorId,
        type: 'discovery' as const,
        status: 'pending' as const,
        locationId: location.id,
        studentId: `prospect:${data.firstName} ${data.lastName}`,
        prospectId: prospect.id,
        instructorId: slot.instructorId,
        aircraftId: slot.aircraftId,
        proposedStart: slot.start,
        proposedEnd: slot.end,
        activityTypeId,
        rankingScore: slot.matchScore.toFixed(4),
        rationale: {
          reason: rationale.summary,
          factors: {
            daylightCompliance: 30,
            instructorAvailability: 20,
            aircraftAvailability: 20,
            matchScore: slot.matchScore,
          },
          context: {
            prospectName: `${data.firstName} ${data.lastName}`,
            instructorName: slot.instructorName,
            aircraftRegistration: slot.aircraftRegistration,
            daylightConstrained: !!civilTwilight,
          },
        },
        groupId,
        expiresAt,
      };
    });

    const insertedSuggestions = await db.insert(suggestions).values(suggestionRecords).returning({
      id: suggestions.id,
      proposedStart: suggestions.proposedStart,
      proposedEnd: suggestions.proposedEnd,
      instructorId: suggestions.instructorId,
      aircraftId: suggestions.aircraftId,
      rankingScore: suggestions.rankingScore,
    });

    // Enrich with names from the original slots (DB only stores IDs)
    const enrichedSuggestions = insertedSuggestions.map((s, i) => ({
      ...s,
      instructorName: slots[i]?.instructorName ?? null,
      aircraftRegistration: slots[i]?.aircraftRegistration ?? null,
    }));

    await this.auditService.create({
      operatorId,
      eventType: 'suggestion.created',
      entityType: 'suggestion',
      data: {
        type: 'discovery',
        count: insertedSuggestions.length,
        prospectId: prospect.id,
        groupId,
      },
    });

    this.logger.log(
      `Created ${insertedSuggestions.length} discovery suggestions for prospect ${prospect.id} (group: ${groupId})`,
    );

    return {
      prospect: {
        id: prospect.id,
        firstName: prospect.firstName,
        lastName: prospect.lastName,
        status: prospect.status,
      },
      isAlternative,
      preferredDate: preferredDateStr,
      suggestions: enrichedSuggestions,
    };
  }

  /**
   * Book a specific discovery flight slot:
   * 1. Validate the suggestion exists and is pending
   * 2. Create reservation in reservation_history
   * 3. Mark suggestion as approved
   * 4. Expire all other suggestions in the same group
   * 5. Update prospect status to 'booked'
   * 6. Send confirmation email to prospect
   * 7. Return booking confirmation
   */
  async bookSlot(operatorId: number, suggestionId: string, userId: string) {
    // Load suggestion
    const [suggestion] = await db
      .select()
      .from(suggestions)
      .where(and(eq(suggestions.id, suggestionId), eq(suggestions.operatorId, operatorId)))
      .limit(1);

    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }
    if (suggestion.status !== 'pending') {
      throw new BadRequestException(`Suggestion is already ${suggestion.status}`);
    }
    if (suggestion.type !== 'discovery') {
      throw new BadRequestException('This endpoint is only for discovery flight bookings');
    }

    const now = new Date();

    // 1. Create reservation
    await db.insert(reservationHistory).values({
      operatorId,
      studentId: suggestion.studentId ?? 'prospect',
      instructorId: suggestion.instructorId,
      aircraftId: suggestion.aircraftId,
      activityTypeId: suggestion.activityTypeId,
      locationId: suggestion.locationId,
      startTime: suggestion.proposedStart,
      endTime: suggestion.proposedEnd,
      status: 'completed',
    });

    // 2. Approve this suggestion
    await db
      .update(suggestions)
      .set({
        status: 'approved',
        approvedBy: userId,
        approvedAt: now,
        updatedAt: now,
      })
      .where(eq(suggestions.id, suggestionId));

    // 3. Expire siblings in the same group
    if (suggestion.groupId) {
      await db
        .update(suggestions)
        .set({ status: 'expired', expiredReason: 'slot_filled', updatedAt: now })
        .where(and(eq(suggestions.groupId, suggestion.groupId), eq(suggestions.status, 'pending')));
    }

    // 4. Update prospect status
    let prospectEmail: string | undefined;
    let prospectName = 'Guest';
    if (suggestion.prospectId) {
      const [prospect] = await db
        .select()
        .from(prospects)
        .where(eq(prospects.id, suggestion.prospectId))
        .limit(1);
      if (prospect) {
        await db
          .update(prospects)
          .set({ status: 'booked', updatedAt: now })
          .where(eq(prospects.id, suggestion.prospectId));
        prospectEmail = prospect.email ?? undefined;
        prospectName = `${prospect.firstName} ${prospect.lastName}`;
      }
    }

    // 5. Resolve names for response
    let instructorName: string | undefined;
    if (suggestion.instructorId) {
      const [inst] = await db
        .select()
        .from(instructors)
        .where(eq(instructors.id, suggestion.instructorId))
        .limit(1);
      if (inst) instructorName = `${inst.firstName} ${inst.lastName}`;
    }

    let aircraftRegistration: string | undefined;
    if (suggestion.aircraftId) {
      const [craft] = await db
        .select()
        .from(aircraft)
        .where(eq(aircraft.id, suggestion.aircraftId))
        .limit(1);
      if (craft) aircraftRegistration = craft.registration;
    }

    let activityTypeName: string | undefined;
    if (suggestion.activityTypeId) {
      const [at] = await db
        .select()
        .from(activityTypes)
        .where(eq(activityTypes.id, suggestion.activityTypeId))
        .limit(1);
      if (at) activityTypeName = at.name;
    }

    // 6. Send confirmation email
    let emailSent = false;
    try {
      await this.notificationService.sendBookingConfirmation(operatorId, {
        id: suggestion.id,
        type: suggestion.type,
        prospectId: suggestion.prospectId,
        studentId: suggestion.studentId,
        instructorId: suggestion.instructorId,
        aircraftId: suggestion.aircraftId,
        activityTypeId: suggestion.activityTypeId,
        proposedStart: suggestion.proposedStart,
        proposedEnd: suggestion.proposedEnd,
      });
      emailSent = true;
    } catch (err) {
      this.logger.warn(
        `Email failed for discovery booking: ${err instanceof Error ? err.message : err}`,
      );
    }

    // 7. Audit log
    await this.auditService.create({
      operatorId,
      eventType: 'discovery_booked',
      entityType: 'suggestion',
      entityId: suggestionId,
      actorId: userId,
      data: {
        prospectName,
        prospectEmail,
        instructorName,
        aircraftRegistration,
        proposedStart: suggestion.proposedStart.toISOString(),
        proposedEnd: suggestion.proposedEnd.toISOString(),
      },
    });

    return {
      booking: {
        suggestionId,
        prospectName,
        prospectEmail,
        proposedStart: suggestion.proposedStart,
        proposedEnd: suggestion.proposedEnd,
        instructorName,
        aircraftRegistration,
        activityType: activityTypeName ?? 'Discovery Flight',
        status: 'booked',
      },
      emailSent,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Filter slots by preferred time of day.
   */
  private filterByTimeOfDay(
    slots: FoundSlot[],
    timeOfDay: 'morning' | 'afternoon' | 'evening',
    timezone = 'America/Los_Angeles',
  ): FoundSlot[] {
    return slots.filter((slot) => {
      const hour = getLocalParts(slot.start, timezone).hour;

      switch (timeOfDay) {
        case 'morning':
          return hour >= 6 && hour < 12;
        case 'afternoon':
          return hour >= 12 && hour < 17;
        case 'evening':
          return hour >= 17 && hour < 21;
        default:
          return true;
      }
    });
  }
}
