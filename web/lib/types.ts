// T053: Shared frontend types
// These are defined separately from src/core types since Next.js cannot resolve backend modules.

export type SuggestionType = 'waitlist' | 'reschedule' | 'discovery' | 'next_lesson';

export type SuggestionStatus = 'pending' | 'approved' | 'declined' | 'expired' | 'processing';

export interface SuggestionRationale {
  summary: string;
  inputs: string[];
  constraints: string[];
  policies: string[];
  aiSummary?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  riskReason?: string;
  aiModel?: string;
  aiEnriched?: boolean;
}

export interface Suggestion {
  id: string;
  type: SuggestionType;
  status: SuggestionStatus;
  locationId: string;
  studentName?: string;
  studentId?: string;
  instructorName?: string;
  aircraftRegistration?: string;
  proposedStart: string;
  proposedEnd: string;
  activityType?: string;
  rankingScore?: number;
  rationale: SuggestionRationale;
  groupId?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  expiredReason?: string;
}

export interface ActivityEvent {
  id: string;
  eventType: string;
  summary: string;
  actor?: string;
  timestamp: string;
  details: Record<string, unknown>;
}

export interface WeeklyFlightHour {
  date: string;
  hours: number;
}

export interface QueueHealth {
  pendingCount: number;
  oldestPendingAge: number; // hours
  avgApprovalTime: number; // hours
  expirationRate: number; // percentage
}

export interface DashboardStats {
  pendingSuggestions: number;
  approvedToday: number;
  declinedToday: number;
  expiredToday: number;
  acceptanceRate: number;
  weeklyFlightHours: WeeklyFlightHour[];
  timeToFill: number | null; // average hours
  queueHealth: QueueHealth;
  avgTimeToApproval?: string;
  weeklyFlightHoursDelta?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface User {
  userId: string;
  email: string;
  operatorId: number;
  permissions: string[];
}

export interface LoginResponse {
  token: string;
  user: User;
  mfaRequired: boolean;
  mfaToken?: string;
}

export interface ApproveResponse {
  suggestion: {
    id: string;
    status: string;
    fspReservationId: string;
  };
  reservation: {
    id: string;
    start: string;
    end: string;
  };
}

export interface BulkActionResult {
  id: string;
  status: 'approved' | 'declined' | 'failed';
  fspReservationId?: string;
  error?: string;
}

export interface BulkActionResponse {
  results: BulkActionResult[];
  summary: {
    approved?: number;
    declined?: number;
    failed: number;
  };
}

export interface ApiError {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface SchedulingPolicies {
  waitlistWeights: {
    timeSinceLastFlight: number;
    timeUntilNextFlight: number;
    totalHours: number;
    custom: Record<string, number>;
  };
  rescheduleAlternativesCount: number;
  searchWindowInitialDays: number;
  searchWindowIncrementDays: number;
  searchWindowMaxDays: number;
  suggestionTtlHours: number;
  pollingIntervalMinutes: number;
  notificationPreferences: {
    email: boolean;
    sms: boolean;
  };
}

export interface SuggestionFilters {
  status?: SuggestionStatus | 'all' | '';
  type?: SuggestionType | '';
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

// ─── Discovery (Phase 6) ────────────────────────────────────────────────────

export interface Prospect {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  status: 'pending' | 'booked' | 'cancelled';
  createdAt: string;
}

export interface CreateDiscoveryRequest {
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
  locationId?: string;
}

export interface DiscoveryResponse {
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
    proposedStart: string;
    proposedEnd: string;
    instructorId?: string;
    aircraftId?: string;
    rankingScore?: number;
    instructorName?: string;
    aircraftRegistration?: string;
  }>;
}

// ─── Notification Templates (Phase 7) ───────────────────────────────────────

export interface NotificationTemplate {
  id: string;
  operatorId: number;
  type: string;
  channel: 'email' | 'sms';
  subject: string | null;
  bodyTemplate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateTemplateRequest {
  subject?: string;
  bodyTemplate?: string;
}

// ─── Weather (Phase 2) ──────────────────────────────────────────────────────

export type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR';

export interface CurrentWeather {
  observedAt: string;
  temperature: number;
  windSpeed: number;
  windGust: number;
  windDirection: number;
  visibility: number;
  cloudCover: number;
  weatherCode: number;
  flightCategory: FlightCategory;
}

export interface HourlyForecast {
  time: string;
  temperature: number;
  windSpeed: number;
  windGust: number;
  windDirection: number;
  visibility: number;
  cloudCover: number;
  weatherCode: number;
  flightCategory: FlightCategory;
}

export interface WeatherData {
  locationId: string;
  locationName: string;
  latitude: number;
  longitude: number;
  current: CurrentWeather;
  forecast: HourlyForecast[];
}

// ─── Student Insights (Phase 3) ─────────────────────────────────────────────

export interface InactiveStudent {
  studentId: string;
  studentName: string;
  daysSinceLastFlight: number;
  lastFlightDate: string | null;
  totalFlightHours: number;
}

export interface CheckrideReadyStudent {
  studentId: string;
  studentName: string;
  enrollmentProgress: number;
  totalFlightHours: number;
  completedLessons: number;
  totalLessons: number;
}

export interface AtRiskStudent {
  studentId: string;
  studentName: string;
  riskReason: string;
  daysSinceLastFlight: number;
  totalFlightHours: number;
}

export interface InstructorWorkload {
  instructorId: string;
  instructorName: string;
  dailyFlightHours: number;
  weeklyFlightHours: number;
  flightsToday: number;
  flightsThisWeek: number;
}

export interface InsightsData {
  inactive: InactiveStudent[];
  checkrideReady: CheckrideReadyStudent[];
  atRisk: AtRiskStudent[];
  instructorWorkload: InstructorWorkload[];
}

// ─── Disruptions (Phase 4) ─────────────────────────────────────────────────

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
  detectedAt: string;
  resolvedAt: string | null;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DisruptionSummary {
  total: number;
  critical: number;
  warning: number;
  byType: {
    weather: number;
    maintenance: number;
    instructor: number;
  };
}

export interface DisruptionsResponse {
  data: DisruptionEvent[];
  summary: DisruptionSummary;
}

// ─── Flight Alerts (Phase 6 — Fleet Dashboard) ──────────────────────────────

export type FlightAlertType = 'overdue_return' | 'safety' | 'maintenance_due' | 'weather_hold';

export type FlightAlertSeverity = 'info' | 'warning' | 'critical';

export interface FlightAlert {
  id: string;
  operatorId: number;
  reservationId: string | null;
  alertType: FlightAlertType;
  severity: FlightAlertSeverity;
  title: string;
  description: string | null;
  aircraftId: string | null;
  instructorId: string | null;
  studentId: string | null;
  isResolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
}

// ─── Feature Flags (Phase 7) ────────────────────────────────────────────────

export interface FeatureFlag {
  id: string;
  operatorId: number;
  flagName: string;
  enabled: boolean;
  config: Record<string, unknown>;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}
