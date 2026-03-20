/**
 * Re-exports of key FSP API types used throughout the application.
 *
 * Import from here rather than reaching into the API layer directly:
 *   import type { FspAircraft, FspInstructor } from '@/src/core/types/fsp.js';
 */

export type {
  // Operators
  FspOperator,
  FspOperatorDetail,

  // Students
  FspStudent,

  // Instructors
  FspInstructor,

  // Aircraft
  FspAircraft,

  // Locations
  FspLocation,

  // Activity Types
  FspActivityType,

  // Reservations
  FspCreateReservationRequest,
  FspReservationResponse,
  FspReservationListItem,
  FspReservationListResponse,
  FspReservationDetail,

  // Schedule
  FspScheduleEvent,
  FspScheduleResponse,

  // Schedulable Events (training)
  FspSchedulableEvent,
  FspSchedulableEventsRequest,

  // Availability
  FspAvailability,
  FspAvailabilityRequest,

  // Enrollments
  FspEnrollment,
  FspEnrollmentProgress,

  // Civil Twilight
  FspCivilTwilight,

  // Auth
  FspLoginResponse,
  FspMfaResponse,

  // Errors
  FspApiError,
} from '../../api/fsp/fsp.types.js';
