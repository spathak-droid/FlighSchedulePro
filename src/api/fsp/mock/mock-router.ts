/**
 * Mock HTTP router for FSP API — matches URL paths and returns mock responses
 * matching the exact shapes from CompanyDocs/api-appendix.md.
 *
 * This intercepts at the HTTP transport level inside FspClient, so all real
 * service code (FspAuthService, FspScheduleService, etc.) runs unchanged.
 *
 * Multi-tenant: routes are operator-aware. operatorId is extracted from URL
 * paths (e.g., /operators/1002/aircraft) and used to return operator-specific
 * data. Login tracks the user's email to resolve their operator on /myoperators.
 *
 * Coverage: all 19 endpoint groups from the API appendix (76 endpoints).
 */
import { Logger } from '@nestjs/common';
import {
  MOCK_PERMISSIONS,
  MOCK_ACTIVITY_TYPES,
  MOCK_ENROLLMENT_PROGRESS,
  MOCK_ENROLLMENT_DETAILS,
  MOCK_AVAILABILITY_OVERRIDES,
  MOCK_OPERATOR_ID,
  MOCK_AIRCRAFT_TIMES,
  MOCK_AIRCRAFT_SQUAWKS,
  MOCK_MAINTENANCE_REMINDERS,
  MOCK_SCHEDULE_FILTERS,
  MOCK_CANCELLATION_REASONS,
  MOCK_AUTOSCHEDULE_SETTINGS,
  MOCK_FIND_TIME_PREFERENCES,
  MOCK_CHECKRIDE_SCORES,
  MOCK_KNOWLEDGE_TESTS,
  MOCK_TRAINING_ALERTS,
  MOCK_FLIGHT_ALERTS,
  MOCK_ALL_OPERATOR_DETAILS,
  MOCK_LOGIN_BY_EMAIL,
  MOCK_LOGIN_RESPONSE,
  generateScheduleResponse,
  generateReservationListItems,
  generateReservationDetail,
  generateSchedulableEvents,
  generateCivilTwilight,
  generateAutoScheduleResults,
  generateFindTimeSlots,
  generateBatchId,
  generateBatchStatus,
  generateTrainingSessions,
  generateStudentProgressReport,
  generateAvailableTimes,
  generateEnrollmentHistory,
  // Multi-tenant lookups
  extractOperatorId,
  setLastLoginEmail,
  getLastLoginEmail,
  getOperatorForEmail,
  getLocationsForOperator,
  getAircraftForOperator,
  getInstructorsForOperator,
  getStudentsForOperator,
  getUsersForOperator,
  getAvailabilityForOperator,
  getEnrollmentsForOperator,
} from './mock-data.js';

const logger = new Logger('MockFspRouter');

interface MockResponse {
  status: number;
  body: unknown;
}

let reservationCounter = 9000;
let lastBatchId = '';

/**
 * Route a request to the appropriate mock handler.
 * Returns null if no mock matches (shouldn't happen if all endpoints are covered).
 */
export function mockRoute(method: string, path: string, body?: unknown): MockResponse | null {
  logger.debug(`[MOCK] ${method} ${path}`);

  // Extract operatorId from URL for operator-scoped endpoints
  const opId = extractOperatorId(path);

  // ── 1. Authentication ──────────────────────────────────────────────────

  if (path.includes('/sessions/credentials') && method === 'POST') {
    const req = body as { email?: string } | undefined;
    const email = req?.email ?? '';
    setLastLoginEmail(email);
    const entry = MOCK_LOGIN_BY_EMAIL[email];
    const loginResponse = entry?.login ?? MOCK_LOGIN_RESPONSE;
    logger.log(`[MOCK] Login → ${email} (operator ${entry?.operatorId ?? MOCK_OPERATOR_ID})`);
    return { status: 200, body: loginResponse };
  }

  if (path.includes('/sessions/mfa') && method === 'POST') {
    logger.log('[MOCK] MFA → success');
    return { status: 200, body: { token: 'mock-mfa-token-' + Date.now() } };
  }

  if (path.includes('/mfa/ResendEmailCodeViaMfaAuthToken') && method === 'POST') {
    logger.log('[MOCK] Resend MFA email code → success');
    return { status: 200, body: { success: true } };
  }

  if (path.includes('/sessions/refresh') && method === 'POST') {
    const email = getLastLoginEmail();
    const entry = MOCK_LOGIN_BY_EMAIL[email];
    const loginResponse = entry?.login ?? MOCK_LOGIN_RESPONSE;
    return { status: 200, body: { ...loginResponse, token: 'mock-refreshed-' + Date.now() } };
  }

  if (path.includes('/sessions') && method === 'DELETE') {
    return { status: 200, body: {} };
  }

  // ── 2. Operators & Users ───────────────────────────────────────────────

  if (path.match(/\/myoperators\/\d+/) && method === 'GET') {
    const matchedId = parseInt(path.match(/\/myoperators\/(\d+)/)?.[1] ?? '0', 10);
    return {
      status: 200,
      body: MOCK_ALL_OPERATOR_DETAILS[matchedId] ?? MOCK_ALL_OPERATOR_DETAILS[MOCK_OPERATOR_ID],
    };
  }

  if (path.includes('/myoperators') && method === 'GET') {
    // Return only the operator for the last logged-in user
    const email = getLastLoginEmail();
    const operator = getOperatorForEmail(email);
    return { status: 200, body: [operator] };
  }

  // User permissions (must come before general /users/{id})
  if (path.includes('/users/') && path.includes('/permissions') && method === 'GET') {
    return { status: 200, body: MOCK_PERMISSIONS };
  }

  // Single user by ID
  if (path.match(/\/users\/[\w-]+$/) && method === 'GET') {
    const userId = path.split('/users/')[1]?.split('?')[0] ?? '';
    const users = getUsersForOperator(opId);
    const user = users.find((u) => u.id === userId) ?? users[0];
    return { status: 200, body: user };
  }

  // List users
  if (path.includes('/users') && method === 'GET') {
    return { status: 200, body: getUsersForOperator(opId) };
  }

  // ── 3. Locations ───────────────────────────────────────────────────────

  if (path.includes('/locations/') && path.includes('/civilTwilight') && method === 'GET') {
    return { status: 200, body: generateCivilTwilight() };
  }

  if (path.match(/\/locations\/location\/[\w-]+/) && method === 'GET') {
    const locationId = path.split('/location/')[1]?.split('?')[0] ?? '';
    const locations = getLocationsForOperator(opId);
    const location = locations.find((l) => l.id === locationId) ?? locations[0];
    return { status: 200, body: location };
  }

  if (path.includes('/locations') && method === 'GET') {
    return { status: 200, body: getLocationsForOperator(opId) };
  }

  // ── 4. Aircraft ────────────────────────────────────────────────────────

  if (path.includes('/aircraft/') && path.includes('/maintenanceReminders') && method === 'GET') {
    const aircraftId = path.split('/aircraft/')[1]?.split('/')[0] ?? '';
    return { status: 200, body: MOCK_MAINTENANCE_REMINDERS[aircraftId] ?? [] };
  }

  if (path.includes('/aircraft/') && path.includes('/squawks') && method === 'GET') {
    const aircraftId = path.split('/aircraft/')[1]?.split('/')[0] ?? '';
    return { status: 200, body: MOCK_AIRCRAFT_SQUAWKS[aircraftId] ?? [] };
  }

  if (path.includes('/aircraft/') && path.includes('/times') && method === 'GET') {
    const aircraftId = path.split('/aircraft/')[1]?.split('/')[0] ?? '';
    return { status: 200, body: MOCK_AIRCRAFT_TIMES[aircraftId] ?? {} };
  }

  if (path.includes('/aircraft') && method === 'GET') {
    return { status: 200, body: getAircraftForOperator(opId) };
  }

  // ── 5. Instructors ─────────────────────────────────────────────────────

  if (path.includes('/instructors/list') && method === 'GET') {
    return { status: 200, body: getInstructorsForOperator(opId) };
  }

  if (path.includes('/instructors') && method === 'GET') {
    return { status: 200, body: getInstructorsForOperator(opId) };
  }

  // ── 6. Activity Types ──────────────────────────────────────────────────

  if (path.includes('/activitytypes') && method === 'GET') {
    return { status: 200, body: MOCK_ACTIVITY_TYPES };
  }

  // ── 7. Scheduling Groups ──────────────────────────────────────────────

  if (path.includes('/schedulinggroups') && method === 'GET') {
    return { status: 200, body: [] };
  }

  // ── 8. Student & Instructor Availability ──────────────────────────────

  if (path.includes('/availabilityOverride/') && method === 'DELETE') {
    logger.log('[MOCK] Delete availability override → success');
    return { status: 200, body: {} };
  }

  if (path.includes('/availabilityOverride') && method === 'GET') {
    const userId = extractUserIdFromAvailabilityPath(path);
    return { status: 200, body: MOCK_AVAILABILITY_OVERRIDES[userId] ?? [] };
  }

  if (path.includes('/availabilityOverride') && method === 'POST') {
    logger.log('[MOCK] Create availability override → success');
    const override = body as Record<string, unknown> | undefined;
    return { status: 200, body: { id: `avo-new-${Date.now()}`, ...override } };
  }

  if (path.includes('/availabilityOverride') && method === 'PUT') {
    logger.log('[MOCK] Update availability override → success');
    return { status: 200, body: body ?? {} };
  }

  if (path.includes('/availability/reservationAvailability') && method === 'POST') {
    return { status: 200, body: { isAvailable: true, conflicts: [] } };
  }

  if (path.includes('/availabilityAndOverrides') && method === 'POST') {
    const req = body as { userGuidIds?: string[] } | undefined;
    const userIds = req?.userGuidIds ?? [];
    const avail = getAvailabilityForOperator(opId);
    const results = userIds.map((id) => avail[id]).filter(Boolean);
    return { status: 200, body: results.length > 0 ? results : Object.values(avail) };
  }

  if (path.includes('/users/availability') && method === 'POST') {
    return { status: 200, body: Object.values(getAvailabilityForOperator(opId)) };
  }

  if (path.match(/\/users\/[\w-]+\/availability$/) && method === 'PUT') {
    logger.log('[MOCK] Update user availability → success');
    return { status: 200, body: body ?? {} };
  }

  if (path.match(/\/users\/[\w-]+\/availability$/) && method === 'GET') {
    const userId = extractUserIdFromAvailabilityPath(path);
    const avail = getAvailabilityForOperator(opId);
    return {
      status: 200,
      body: avail[userId] ?? { userGuidId: userId, availabilities: [], availabilityOverrides: [] },
    };
  }

  // ── 9. Schedule Data ───────────────────────────────────────────────────

  if (path.includes('/v2/schedule') && method === 'POST') {
    return { status: 200, body: generateScheduleResponse() };
  }

  if (path.includes('/scheduleDisplayHours') && method === 'GET') {
    return { status: 200, body: { startHour: 6, endHour: 21 } };
  }

  if (path.includes('/scheduleFilters') && method === 'GET') {
    return { status: 200, body: MOCK_SCHEDULE_FILTERS };
  }

  if (path.includes('/cancellationReasons') && method === 'GET') {
    return { status: 200, body: MOCK_CANCELLATION_REASONS };
  }

  // ── 10. Schedulable Events ────────────────────────────────────────────

  if (path.includes('/schedulableEvents') && method === 'POST') {
    return { status: 200, body: generateSchedulableEvents() };
  }

  // ── 11. AutoSchedule Solver ───────────────────────────────────────────

  if (path.includes('/autoSchedule/feedback') && method === 'POST') {
    logger.log('[MOCK] AutoSchedule feedback received');
    return { status: 200, body: { success: true } };
  }

  if (path.includes('/autoSchedule') && !path.includes('/settings') && method === 'POST') {
    logger.log('[MOCK] AutoSchedule execute');
    const reqBody = body as
      | { events?: Array<{ eventId: string; customer1Guid?: string }> }
      | undefined;
    return { status: 200, body: generateAutoScheduleResults(reqBody) };
  }

  if (path.includes('/settings/autoSchedule') && method === 'PUT') {
    logger.log('[MOCK] Update AutoSchedule settings');
    return { status: 200, body: { ...MOCK_AUTOSCHEDULE_SETTINGS, ...((body as object) ?? {}) } };
  }

  if (path.includes('/settings/autoSchedule') && method === 'GET') {
    return { status: 200, body: MOCK_AUTOSCHEDULE_SETTINGS };
  }

  // ── 12. Find-a-Time ───────────────────────────────────────────────────

  if (path.includes('/scheduleMatch/availability') && method === 'POST') {
    return { status: 200, body: generateFindTimeSlots() };
  }

  if (path.includes('/scheduleMatch/preferences') && method === 'DELETE') {
    logger.log('[MOCK] Delete Find-a-Time preferences');
    return { status: 200, body: {} };
  }

  if (path.includes('/scheduleMatch/preferences') && method === 'POST') {
    logger.log('[MOCK] Update Find-a-Time preferences');
    return { status: 200, body: { ...MOCK_FIND_TIME_PREFERENCES, ...((body as object) ?? {}) } };
  }

  if (path.includes('/scheduleMatch/preferences') && method === 'GET') {
    return { status: 200, body: MOCK_FIND_TIME_PREFERENCES };
  }

  // ── 13. Reservations — Individual ─────────────────────────────────────

  if (path.includes('/operatorReservations/list') && method === 'POST') {
    const items = generateReservationListItems();
    return {
      status: 200,
      body: { total: items.length, pageIndex: 0, pageSize: 50, results: items },
    };
  }

  if (path.includes('/reservations/availableTimes') && method === 'GET') {
    return { status: 200, body: generateAvailableTimes() };
  }

  if (path.includes('/reservations/checkavailability') && method === 'GET') {
    return { status: 200, body: { isAvailable: true, conflicts: [] } };
  }

  if (path.includes('/reservations/') && path.includes('/aircraftOptions') && method === 'GET') {
    return { status: 200, body: getAircraftForOperator(opId).filter((a) => !a.isSimulator) };
  }

  if (path.includes('/reservations/') && method === 'DELETE') {
    logger.log('[MOCK] Delete reservation → success');
    return { status: 200, body: {} };
  }

  if (path.includes('/V2/Reservation') && method === 'POST') {
    const req = body as { validateOnly?: boolean } | undefined;
    if (req?.validateOnly) {
      logger.log('[MOCK] Validate reservation → pass');
      return { status: 200, body: { errors: [] } };
    }
    const id = `mock-res-${++reservationCounter}`;
    logger.log(`[MOCK] Create reservation → ${id}`);
    return { status: 200, body: { id, errors: [] } };
  }

  if (path.includes('/V2/Reservation') && method === 'PUT') {
    logger.log('[MOCK] Update reservation → success');
    return { status: 200, body: { errors: [] } };
  }

  if (path.match(/\/V2\/Reservation\/[\w-]+/) && method === 'GET') {
    const resId = path.split('/Reservation/')[1]?.split('?')[0] ?? 'unknown';
    return { status: 200, body: generateReservationDetail(resId) };
  }

  if (path.includes('/V2/Reservation') && path.includes('personId') && method === 'GET') {
    const items = generateReservationListItems();
    const personId = new URLSearchParams(path.split('?')[1] ?? '').get('personId') ?? '';
    const filtered = personId ? items.filter((r) => r.pilotId === personId) : items;
    return { status: 200, body: filtered };
  }

  if (path.includes('/V2/Reservation') && method === 'GET') {
    return { status: 200, body: generateReservationListItems() };
  }

  // ── 14. Reservations — Batch ──────────────────────────────────────────

  if (path.includes('/batchReservations/status/') && method === 'GET') {
    const batchId = path.split('/status/')[1]?.split('?')[0] ?? lastBatchId;
    return { status: 200, body: generateBatchStatus(batchId) };
  }

  if (path.includes('/batchReservations') && method === 'POST') {
    lastBatchId = generateBatchId();
    const reqBody = body as { reservations?: unknown[] } | undefined;
    const count = Array.isArray(reqBody?.reservations) ? reqBody.reservations.length : 5;
    logger.log(`[MOCK] Batch reservation publish → ${lastBatchId} (${count} reservations)`);
    return { status: 200, body: { batchId: lastBatchId, status: 'processing', totalCount: count } };
  }

  // ── 15. Enrollment & Training Progress ────────────────────────────────

  if (path.includes('/trainingsessions') && method === 'GET') {
    const params = new URLSearchParams(path.split('?')[1] ?? '');
    return { status: 200, body: generateTrainingSessions(params.get('enrollmentId') ?? undefined) };
  }

  if (path.includes('/reports') && method === 'GET') {
    const params = new URLSearchParams(path.split('?')[1] ?? '');
    return {
      status: 200,
      body: generateStudentProgressReport(params.get('enrollmentId') ?? undefined),
    };
  }

  if (path.includes('/enrollments/') && path.includes('/status-changed') && method === 'POST') {
    logger.log('[MOCK] Enrollment status change notification sent');
    return { status: 200, body: { success: true } };
  }

  if (path.includes('/enrollments/') && path.includes('/progress') && method === 'PUT') {
    logger.log('[MOCK] Update enrollment progress');
    return { status: 200, body: body ?? {} };
  }

  if (path.includes('/enrollments/') && path.includes('/progress') && method === 'GET') {
    const enrollmentId = path.split('/enrollments/')[1]?.split('/')[0] ?? '';
    const progress = MOCK_ENROLLMENT_PROGRESS[enrollmentId];
    return { status: 200, body: progress ?? Object.values(MOCK_ENROLLMENT_PROGRESS)[0] };
  }

  if (path.includes('/enrollments/') && path.includes('/history') && method === 'GET') {
    return { status: 200, body: generateEnrollmentHistory() };
  }

  if (path.includes('/enrollments/list/') && method === 'GET') {
    const studentId = path.split('/list/')[1]?.split('?')[0] ?? '';
    const enrollments = getEnrollmentsForOperator(opId);
    return { status: 200, body: enrollments[studentId] ?? Object.values(enrollments)[0] ?? [] };
  }

  if (path.match(/\/enrollments\/[\w-]+$/) && method === 'GET') {
    const enrollmentId = path.split('/enrollments/')[1]?.split('?')[0] ?? '';
    return {
      status: 200,
      body: MOCK_ENROLLMENT_DETAILS[enrollmentId] ?? Object.values(MOCK_ENROLLMENT_DETAILS)[0],
    };
  }

  if (path.includes('/checkrideExamScores') && method === 'GET') {
    return { status: 200, body: MOCK_CHECKRIDE_SCORES };
  }

  if (path.includes('/knowledgetests') && method === 'GET') {
    return { status: 200, body: MOCK_KNOWLEDGE_TESTS };
  }

  // ── 16. Students ──────────────────────────────────────────────────────

  if (path.includes('/students/search') && method === 'POST') {
    return { status: 200, body: getStudentsForOperator(opId) };
  }

  if (path.includes('/students/dropdownitems') && method === 'GET') {
    const students = getStudentsForOperator(opId);
    return {
      status: 200,
      body: students.map((s) => ({
        id: s.id,
        name: s.fullName ?? `${s.firstName} ${s.lastName}`,
        email: s.email,
      })),
    };
  }

  if (path.includes('/students') && method === 'GET') {
    return { status: 200, body: getStudentsForOperator(opId) };
  }

  if (path.includes('/alerts') && method === 'GET') {
    return { status: 200, body: MOCK_TRAINING_ALERTS };
  }

  // ── 17. Weather ───────────────────────────────────────────────────────

  if (path.includes('/weather/metar') && method === 'GET') {
    return { status: 200, body: { raw: 'KPAO 181756Z 30010KT 10SM FEW025 18/08 A3002' } };
  }

  if (path.includes('/weather/taf') && method === 'GET') {
    return { status: 200, body: { raw: 'TAF KPAO 181730Z 1818/1918 30012KT P6SM FEW030' } };
  }

  // ── 18. Civil Twilight (handled above under Locations) ────────────────

  // ── 19. Flight Alerts ─────────────────────────────────────────────────

  if (path.includes('/flightAlerts/') && path.includes('/complete') && method === 'POST') {
    const reservationId = path.split('/flightAlerts/')[1]?.split('/')[0] ?? '';
    logger.log(`[MOCK] Complete flight alert for reservation ${reservationId}`);
    const alert = MOCK_FLIGHT_ALERTS.find((a) => a.reservationId === reservationId);
    return {
      status: 200,
      body: alert ? { ...alert, status: 'completed' } : { status: 'completed' },
    };
  }

  if (path.includes('/flightAlerts/overdue') && method === 'GET') {
    return { status: 200, body: MOCK_FLIGHT_ALERTS.filter((a) => a.status === 'overdue') };
  }

  if (path.includes('/flightAlerts/aircraft/') && method === 'GET') {
    const aircraftId = path.split('/aircraft/')[1]?.split('?')[0] ?? '';
    return { status: 200, body: MOCK_FLIGHT_ALERTS.filter((a) => a.aircraftId === aircraftId) };
  }

  if (path.includes('/flightAlerts/type/') && method === 'GET') {
    const alertType = path.split('/type/')[1]?.split('?')[0] ?? '';
    return { status: 200, body: MOCK_FLIGHT_ALERTS.filter((a) => a.type === alertType) };
  }

  if (path.match(/\/flightAlerts\/[\w-]+$/) && method === 'POST') {
    const reservationId = path.split('/flightAlerts/')[1]?.split('?')[0] ?? '';
    logger.log(`[MOCK] Create flight alert for reservation ${reservationId}`);
    return {
      status: 200,
      body: {
        id: `fa-new-${Date.now()}`,
        reservationId,
        operatorId: opId,
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    };
  }

  if (path.match(/\/flightAlerts\/[\w-]+$/) && method === 'PUT') {
    const reservationId = path.split('/flightAlerts/')[1]?.split('?')[0] ?? '';
    logger.log(`[MOCK] Update flight alert for reservation ${reservationId}`);
    const alert = MOCK_FLIGHT_ALERTS.find((a) => a.reservationId === reservationId);
    return { status: 200, body: alert ? { ...alert, ...((body as object) ?? {}) } : (body ?? {}) };
  }

  if (path.includes('/flightAlerts') && method === 'GET') {
    return { status: 200, body: MOCK_FLIGHT_ALERTS };
  }

  // ── Catch-all ─────────────────────────────────────────────────────────
  logger.warn(`[MOCK] Unhandled route: ${method} ${path} — returning empty object`);
  return { status: 200, body: {} };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractUserIdFromAvailabilityPath(path: string): string {
  const match = path.match(/\/users\/([\w-]+)\/availability/);
  return match?.[1] ?? '';
}
