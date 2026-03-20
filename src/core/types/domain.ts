/**
 * Application-level domain types.
 *
 * These mirror the DB schema but are plain TypeScript interfaces used
 * throughout the application layer. They are NOT Drizzle table definitions.
 */

// ─── Suggestion ──────────────────────────────────────────────────────────────

export type SuggestionType = 'waitlist' | 'reschedule' | 'discovery' | 'next_lesson';
export type SuggestionStatus = 'pending' | 'approved' | 'declined' | 'expired' | 'processing';
export type SuggestionExpiredReason = 'ttl_exceeded' | 'slot_filled';

export interface SuggestionRationale {
  /** Human-readable explanation of why this suggestion was generated. */
  reason: string;
  /** Factors and their weighted scores that contributed to ranking. */
  factors?: Record<string, number>;
  /** Any additional context (e.g. waitlist position, cancellation details). */
  context?: Record<string, unknown>;
}

export interface Suggestion {
  id: string;
  operatorId: number;
  type: SuggestionType;
  status: SuggestionStatus;
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
  rankingScore: number | null;
  rationale: SuggestionRationale;
  groupId: string | null;
  expiresAt: Date;
  approvedBy: string | null;
  approvedAt: Date | null;
  declinedBy: string | null;
  declinedAt: Date | null;
  expiredReason: SuggestionExpiredReason | null;
  fspReservationId: string | null;
  fspValidationErrors: unknown[] | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Prospect ────────────────────────────────────────────────────────────────

export type ProspectStatus = 'pending' | 'booked' | 'cancelled';

export interface ProspectPreferredDate {
  date: string;
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'anytime';
}

export interface Prospect {
  id: string;
  operatorId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  preferredDates: ProspectPreferredDate[] | null;
  notes: string | null;
  fspReservationId: string | null;
  status: ProspectStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Scheduling Policy ──────────────────────────────────────────────────────

export interface WaitlistWeights {
  waitTime?: number;
  studentProgress?: number;
  instructorPreference?: number;
  aircraftMatch?: number;
  timeOfDayMatch?: number;
  [key: string]: number | undefined;
}

export interface NotificationPreferences {
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  notifyOnSuggestion?: boolean;
  notifyOnExpiry?: boolean;
  [key: string]: boolean | undefined;
}

export interface SchedulingPolicy {
  id: string;
  operatorId: number;
  waitlistWeights: WaitlistWeights;
  rescheduleAlternativesCount: number;
  searchWindowInitialDays: number;
  searchWindowIncrementDays: number;
  searchWindowMaxDays: number;
  suggestionTtlHours: number;
  pollingIntervalMinutes: number;
  notificationPreferences: NotificationPreferences;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Audit Event ─────────────────────────────────────────────────────────────

export type AuditEventType =
  | 'suggestion.created'
  | 'suggestion.approved'
  | 'suggestion.declined'
  | 'suggestion.expired'
  | 'reservation.created'
  | 'reservation.deleted'
  | 'reservation.validated'
  | 'prospect.created'
  | 'prospect.booked'
  | 'prospect.cancelled'
  | 'policy.updated'
  | 'sync.started'
  | 'sync.completed'
  | 'sync.failed'
  | 'notification.sent'
  | 'notification.failed';

export type AuditEntityType =
  | 'suggestion'
  | 'prospect'
  | 'reservation'
  | 'policy'
  | 'sync'
  | 'notification';

export interface AuditEvent {
  id: string;
  operatorId: number;
  eventType: AuditEventType | string;
  entityType: AuditEntityType | string | null;
  entityId: string | null;
  actorId: string | null;
  data: Record<string, unknown>;
  createdAt: Date;
}

// ─── Notification Record ─────────────────────────────────────────────────────

export type NotificationChannel = 'email' | 'sms';
export type NotificationRecipientType = 'student' | 'prospect';
export type NotificationDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';

export interface NotificationContent {
  subject?: string;
  body: string;
  templateId?: string;
  templateVars?: Record<string, string>;
}

export interface NotificationRecord {
  id: string;
  operatorId: number;
  suggestionId: string | null;
  recipientType: NotificationRecipientType;
  recipientId: string;
  channel: NotificationChannel;
  templateId: string | null;
  content: NotificationContent;
  deliveryStatus: NotificationDeliveryStatus;
  deliveryError: string | null;
  sentAt: Date | null;
  createdAt: Date;
}
