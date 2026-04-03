// ─── Authentication ──────────────────────────────────────────────────────────

export interface FspLoginRequest {
  email: string;
  password: string;
}

export interface FspLoginResponse {
  token: string;
  user: {
    email: string;
    id: string;
    firstName: string;
    lastName: string;
  };
  mfaRequired?: boolean;
  mfaToken?: string;
}

export interface FspMfaRequest {
  mfaToken: string;
  mfaCode: string;
  mfaMethod: number; // 1=Authenticator, 2=Email, 100=Backup
  rememberMe?: boolean;
}

export interface FspMfaResponse {
  token: string;
}

// ─── Operators ───────────────────────────────────────────────────────────────

export interface FspOperator {
  id: number;
  name: string;
  isActive: boolean;
  isPending: boolean;
}

export interface FspOperatorDetail extends FspOperator {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export interface FspUser {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  imageUrl?: string;
}

export interface FspUserPermissions {
  userId: string;
  permissions: string[];
}

// ─── Locations ───────────────────────────────────────────────────────────────

export interface FspLocation {
  id: string;
  name: string;
  code: string; // ICAO
  timeZone: string;
  isActive: boolean;
  latitude?: number;
  longitude?: number;
}

// ─── Aircraft ────────────────────────────────────────────────────────────────

export interface FspAircraft {
  id: string;
  registration: string;
  make: string;
  model: string;
  makeModel: string;
  isActive: boolean;
  isSimulator: boolean;
}

// ─── Instructors ─────────────────────────────────────────────────────────────

export interface FspInstructor {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  instructorType: string;
  isActive: boolean;
  locationId?: string;
}

// ─── Activity Types ──────────────────────────────────────────────────────────

export interface FspActivityType {
  id: string;
  name: string;
  displayType: number; // 0=Rental/Instruction, 1=Maintenance, 2=Class, 3=Meeting
  isActive: boolean;
}

// ─── Students ────────────────────────────────────────────────────────────────

export interface FspStudent {
  id: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  email?: string;
  locationId?: string;
}

// ─── Availability ────────────────────────────────────────────────────────────

export interface FspAvailabilityRequest {
  userGuidIds: string[];
  startAtUtc: string;
  endAtUtc: string;
}

export interface FspAvailabilityEntry {
  dayOfWeek: number; // 0=Sunday, 6=Saturday
  startAtTimeUtc: string;
  endAtTimeUtc: string;
}

export interface FspAvailabilityOverride {
  date: string;
  startTime: string;
  endTime: string;
  isUnavailable: boolean;
}

export interface FspAvailability {
  userGuidId: string;
  availabilities: FspAvailabilityEntry[];
  availabilityOverrides: FspAvailabilityOverride[];
}

// ─── Schedule ────────────────────────────────────────────────────────────────

export interface FspScheduleRequest {
  start: string;
  end: string;
  locationIds: number[];
  aircraftIds?: string[];
  instructorIds?: string[];
  outputFormat?: string;
  pageSize?: number;
}

export interface FspScheduleEvent {
  Start: string;
  End: string;
  Title: string;
  CustomerName: string;
  InstructorName: string;
  AircraftName: string;
}

export interface FspScheduleUnavailability {
  ResourceId: string;
  StartDate: string;
  EndDate: string;
  Name: string;
}

export interface FspScheduleResponse {
  results: {
    events: FspScheduleEvent[];
    resources: unknown[];
    unavailability: FspScheduleUnavailability[];
  };
}

// ─── Reservations ────────────────────────────────────────────────────────────

export interface FspTrainingSession {
  courseId: string;
  lessonId: string;
  enrollmentId: string;
  studentId: string;
}

export interface FspCreateReservationRequest {
  aircraftId: string;
  application?: number;
  client?: string;
  comments?: string;
  end: string; // LOCAL TIME - no timezone suffix
  equipmentIds?: string[];
  estimatedFlightHours?: string;
  flightRoute?: string;
  flightRules?: number; // 1=VFR, 2=IFR
  flightType?: number; // 0=Dual, 1=Solo
  instructorId?: string;
  instructorPostFlightMinutes?: number;
  instructorPreFlightMinutes?: number;
  internalComments?: string;
  locationId: number;
  operatorId: number;
  overrideExceptions?: boolean;
  pilotId: string;
  recurring?: boolean;
  reservationTypeId?: string;
  schedulingGroupId?: string | null;
  schedulingGroupSlotId?: string | null;
  sendEmailNotification?: boolean;
  start: string; // LOCAL TIME - no timezone suffix
  trainingSessions?: FspTrainingSession[];
  validateOnly: boolean;
}

export interface FspReservationError {
  message: string;
  field?: string;
}

export interface FspReservationResponse {
  id?: string;
  errors?: FspReservationError[];
}

export interface FspReservationListRequest {
  dateRangeType: number; // 1=Future, 2=Past, 3=Custom
  startRange: string;
  endRange: string;
  locationIds?: number[];
  pageSize?: number;
  pageIndex?: number;
}

export interface FspReservationListItem {
  reservationId: string;
  reservationNumber: number;
  resource: string;
  start: string;
  end: string;
  pilotFirstName: string;
  pilotLastName: string;
  pilotId: string;
  status: number;
}

export interface FspReservationListResponse {
  total: number;
  pageIndex: number;
  pageSize: number;
  results: FspReservationListItem[];
}

export interface FspReservationDetail {
  id: string;
  reservationNumber: number;
  aircraftId: string;
  instructorId?: string;
  pilotId: string;
  start: string;
  end: string;
  locationId: number;
  operatorId: number;
  status: number;
  comments?: string;
  internalComments?: string;
}

// ─── Schedulable Events ──────────────────────────────────────────────────────

export interface FspSchedulableEventsRequest {
  startDate: string;
  endDate: string;
  locationId: number;
  listType?: number;
  filters?: unknown[];
  priorities?: unknown[];
  useAllInstructors?: boolean;
}

export interface FspSchedulableEvent {
  eventId: string;
  enrollmentId: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  courseId: string;
  courseName: string;
  lessonId: string;
  lessonName: string;
  lessonOrder: number;
  flightType: number; // 0=Dual, 1=Solo
  routeType: number; // 0=Local, 1=Cross Country
  timeOfDay: number; // 0=Anytime, 1=Day, 2=Night
  durationTotal: number;
  aircraftDurationTotal: number;
  instructorDurationPre: number;
  instructorDurationPost: number;
  instructorDurationTotal: number;
  instructorRequired: boolean;
  instructorIds: string[];
  aircraftIds: string[];
  schedulingGroupIds: string[];
  meetingRoomIds: string[];
  isStageCheck: boolean;
  reservationTypeId: string;
  activityTypeId: string;
}

// ─── Enrollments ─────────────────────────────────────────────────────────────

export interface FspEnrollment {
  id: string;
  studentId: string;
  courseId: string;
  courseName: string;
  status: string;
}

export interface FspEnrollmentLesson {
  lessonId: string;
  lessonName: string;
  order: number;
  isCompleted: boolean;
}

export interface FspEnrollmentProgress {
  enrollmentId: string;
  completedLessons: number;
  totalLessons: number;
  lessons: FspEnrollmentLesson[];
}

// ─── Civil Twilight ──────────────────────────────────────────────────────────

export interface FspCivilTwilight {
  startDate: string;
  endDate: string;
}

// ─── Find-a-Time ─────────────────────────────────────────────────────────────

export interface FspFindTimeRequest {
  activityTypeId?: string;
  instructorIds?: string[];
  aircraftIds?: string[];
  schedulingGroupIds?: string[];
  customerId?: string;
  startDate: string;
  endDate: string;
}

// ─── Generic API Response Wrapper ────────────────────────────────────────────

export interface FspApiError {
  statusCode: number;
  message: string;
  errors?: FspReservationError[];
}
