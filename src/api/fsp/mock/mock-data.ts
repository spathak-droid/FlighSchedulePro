/**
 * Comprehensive mock dataset for FSP API — SkyWest Flight Academy (operator 1001).
 *
 * All dates are generated dynamically relative to `new Date()` so the data
 * is always in the future regardless of when the server starts.
 */
import type {
  FspOperator,
  FspOperatorDetail,
  FspUser,
  FspUserPermissions,
  FspLocation,
  FspAircraft,
  FspInstructor,
  FspStudent,
  FspActivityType,
  FspScheduleEvent,
  FspScheduleResponse,
  FspReservationListItem,
  FspReservationDetail,
  FspEnrollment,
  FspEnrollmentProgress,
  FspEnrollmentLesson,
  FspSchedulableEvent,
  FspCivilTwilight,
  FspAvailability,
  FspAvailabilityEntry,
  FspLoginResponse,
} from '../fsp.types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return a date N days from now at a specific hour:minute (local). */
function futureDate(daysFromNow: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Format a Date as FSP local-time string (no timezone suffix). */
function fspLocal(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** ISO date string (date portion only). */
function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

// ─── Operator ─────────────────────────────────────────────────────────────────

export const MOCK_OPERATOR_ID = 1001;

export const MOCK_OPERATOR: FspOperator = {
  id: MOCK_OPERATOR_ID,
  name: 'SkyWest Flight Academy',
  isActive: true,
  isPending: false,
};

export const MOCK_OPERATOR_DETAIL: FspOperatorDetail = {
  ...MOCK_OPERATOR,
  userId: 'usr-001',
  firstName: 'Sarah',
  lastName: 'Chen',
  email: 'sarah@skywest.edu',
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const MOCK_USERS: FspUser[] = [
  {
    id: 'usr-001',
    firstName: 'Sarah',
    lastName: 'Chen',
    fullName: 'Sarah Chen',
    email: 'sarah@skywest.edu',
    role: 'scheduler',
    isActive: true,
  },
  {
    id: 'usr-002',
    firstName: 'Mike',
    lastName: 'Torres',
    fullName: 'Mike Torres',
    email: 'mike@skywest.edu',
    role: 'admin',
    isActive: true,
  },
];

export const MOCK_LOGIN_RESPONSE: FspLoginResponse = {
  token: 'mock-jwt-token-skywest-fsp-2024',
  user: {
    email: 'sarah@skywest.edu',
    id: 'usr-001',
    firstName: 'Sarah',
    lastName: 'Chen',
  },
  mfaRequired: false,
};

export const MOCK_PERMISSIONS: FspUserPermissions = {
  userId: 'usr-001',
  permissions: [
    'schedule.read',
    'schedule.write',
    'reservations.create',
    'reservations.delete',
    'reservations.update',
    'students.read',
    'instructors.read',
    'aircraft.read',
    'locations.read',
    'enrollments.read',
    'reports.read',
    'operator.manage',
  ],
};

// ─── Locations ────────────────────────────────────────────────────────────────

export const MOCK_LOCATIONS: FspLocation[] = [
  {
    id: 'loc-001',
    name: 'KPAO - Palo Alto Airport',
    code: 'KPAO',
    timeZone: 'America/Los_Angeles',
    isActive: true,
    latitude: 37.4613,
    longitude: -122.115,
  },
  {
    id: 'loc-002',
    name: 'KSQL - San Carlos Airport',
    code: 'KSQL',
    timeZone: 'America/Los_Angeles',
    isActive: true,
    latitude: 37.5118,
    longitude: -122.2495,
  },
];

// ─── Aircraft ─────────────────────────────────────────────────────────────────

export const MOCK_AIRCRAFT: FspAircraft[] = [
  {
    id: 'ac-001',
    registration: 'N172SP',
    make: 'Cessna',
    model: '172S Skyhawk SP',
    makeModel: 'Cessna 172S Skyhawk SP',
    isActive: true,
    isSimulator: false,
  },
  {
    id: 'ac-002',
    registration: 'N152AB',
    make: 'Cessna',
    model: '152',
    makeModel: 'Cessna 152',
    isActive: true,
    isSimulator: false,
  },
  {
    id: 'ac-003',
    registration: 'N182RG',
    make: 'Cessna',
    model: '182RG Skylane',
    makeModel: 'Cessna 182RG Skylane',
    isActive: true,
    isSimulator: false,
  },
  {
    id: 'ac-004',
    registration: 'SIM-01',
    make: 'Redbird',
    model: 'FMX',
    makeModel: 'Redbird FMX',
    isActive: true,
    isSimulator: true,
  },
];

// ─── Instructors ──────────────────────────────────────────────────────────────

export const MOCK_INSTRUCTORS: FspInstructor[] = [
  {
    id: 'inst-001',
    firstName: 'James',
    lastName: 'Wilson',
    fullName: 'James Wilson',
    instructorType: 'CFI',
    isActive: true,
  },
  {
    id: 'inst-002',
    firstName: 'Lisa',
    lastName: 'Park',
    fullName: 'Lisa Park',
    instructorType: 'CFII',
    isActive: true,
  },
  {
    id: 'inst-003',
    firstName: 'David',
    lastName: 'Kim',
    fullName: 'David Kim',
    instructorType: 'CFI',
    isActive: true,
  },
  {
    id: 'inst-004',
    firstName: 'Tina',
    lastName: 'Nguyen',
    fullName: 'Tina Nguyen',
    instructorType: 'CFI',
    isActive: true,
  },
  {
    id: 'inst-005',
    firstName: 'Marcus',
    lastName: 'Rivera',
    fullName: 'Marcus Rivera',
    instructorType: 'CFII',
    isActive: true,
  },
];

// ─── Students ─────────────────────────────────────────────────────────────────

export const MOCK_STUDENTS: FspStudent[] = [
  {
    id: 'stu-001',
    firstName: 'Alex',
    lastName: 'Johnson',
    fullName: 'Alex Johnson',
    email: 'alex.j@email.com',
  },
  {
    id: 'stu-002',
    firstName: 'Emily',
    lastName: 'Davis',
    fullName: 'Emily Davis',
    email: 'emily.d@email.com',
  },
  {
    id: 'stu-003',
    firstName: 'Ryan',
    lastName: 'Martinez',
    fullName: 'Ryan Martinez',
    email: 'ryan.m@email.com',
  },
  {
    id: 'stu-004',
    firstName: 'Sophie',
    lastName: 'Brown',
    fullName: 'Sophie Brown',
    email: 'sophie.b@email.com',
  },
  {
    id: 'stu-005',
    firstName: 'Tyler',
    lastName: 'Lee',
    fullName: 'Tyler Lee',
    email: 'tyler.l@email.com',
  },
  {
    id: 'stu-006',
    firstName: 'Mia',
    lastName: 'Garcia',
    fullName: 'Mia Garcia',
    email: 'mia.g@email.com',
  },
];

// ─── Activity Types ───────────────────────────────────────────────────────────

export const MOCK_ACTIVITY_TYPES: FspActivityType[] = [
  { id: 'at-001', name: 'Private Pilot Training', displayType: 0, isActive: true },
  { id: 'at-002', name: 'Instrument Training', displayType: 0, isActive: true },
  { id: 'at-003', name: 'Discovery Flight', displayType: 0, isActive: true },
  { id: 'at-004', name: 'Aircraft Rental', displayType: 0, isActive: true },
  { id: 'at-005', name: 'Ground School', displayType: 2, isActive: true },
];

// ─── Schedule Events (next 7 days) ───────────────────────────────────────────

/**
 * Generates 18 realistic schedule events spread across the next 7 days with
 * natural-looking gaps so the scheduling engine has open slots to fill.
 */
export function generateScheduleEvents(): FspScheduleEvent[] {
  return [
    // Day 0 (today) — 2 events, gap 12-2pm
    {
      Start: fspLocal(futureDate(0, 8, 0)),
      End: fspLocal(futureDate(0, 10, 0)),
      Title: 'Private Pilot Training',
      CustomerName: 'Alex Johnson',
      InstructorName: 'James Wilson',
      AircraftName: 'N172SP - Cessna 172S Skyhawk SP',
    },
    {
      Start: fspLocal(futureDate(0, 14, 0)),
      End: fspLocal(futureDate(0, 16, 0)),
      Title: 'Instrument Training',
      CustomerName: 'Emily Davis',
      InstructorName: 'Lisa Park',
      AircraftName: 'N172SP - Cessna 172S Skyhawk SP',
    },
    // Day 1 — 3 events
    {
      Start: fspLocal(futureDate(1, 7, 0)),
      End: fspLocal(futureDate(1, 9, 0)),
      Title: 'Private Pilot Training',
      CustomerName: 'Ryan Martinez',
      InstructorName: 'David Kim',
      AircraftName: 'N152AB - Cessna 152',
    },
    {
      Start: fspLocal(futureDate(1, 9, 30)),
      End: fspLocal(futureDate(1, 11, 0)),
      Title: 'Discovery Flight',
      CustomerName: 'Sophie Brown',
      InstructorName: 'James Wilson',
      AircraftName: 'N172SP - Cessna 172S Skyhawk SP',
    },
    {
      Start: fspLocal(futureDate(1, 13, 0)),
      End: fspLocal(futureDate(1, 15, 0)),
      Title: 'Aircraft Rental',
      CustomerName: 'Tyler Lee',
      InstructorName: '',
      AircraftName: 'N182RG - Cessna 182RG Skylane',
    },
    // Day 2 — 3 events, gap 10-1pm
    {
      Start: fspLocal(futureDate(2, 8, 0)),
      End: fspLocal(futureDate(2, 10, 0)),
      Title: 'Instrument Training',
      CustomerName: 'Emily Davis',
      InstructorName: 'Lisa Park',
      AircraftName: 'N172SP - Cessna 172S Skyhawk SP',
    },
    {
      Start: fspLocal(futureDate(2, 13, 0)),
      End: fspLocal(futureDate(2, 14, 30)),
      Title: 'Private Pilot Training',
      CustomerName: 'Alex Johnson',
      InstructorName: 'James Wilson',
      AircraftName: 'N152AB - Cessna 152',
    },
    {
      Start: fspLocal(futureDate(2, 15, 0)),
      End: fspLocal(futureDate(2, 17, 0)),
      Title: 'Ground School',
      CustomerName: 'Mia Garcia',
      InstructorName: 'David Kim',
      AircraftName: 'SIM-01 - Redbird FMX',
    },
    // Day 3 — 3 events
    {
      Start: fspLocal(futureDate(3, 8, 0)),
      End: fspLocal(futureDate(3, 9, 30)),
      Title: 'Private Pilot Training',
      CustomerName: 'Ryan Martinez',
      InstructorName: 'David Kim',
      AircraftName: 'N172SP - Cessna 172S Skyhawk SP',
    },
    {
      Start: fspLocal(futureDate(3, 10, 0)),
      End: fspLocal(futureDate(3, 12, 0)),
      Title: 'Instrument Training',
      CustomerName: 'Emily Davis',
      InstructorName: 'Lisa Park',
      AircraftName: 'N182RG - Cessna 182RG Skylane',
    },
    {
      Start: fspLocal(futureDate(3, 14, 0)),
      End: fspLocal(futureDate(3, 15, 30)),
      Title: 'Private Pilot Training',
      CustomerName: 'Alex Johnson',
      InstructorName: 'James Wilson',
      AircraftName: 'N152AB - Cessna 152',
    },
    // Day 4 — 2 events (light day, more openings)
    {
      Start: fspLocal(futureDate(4, 9, 0)),
      End: fspLocal(futureDate(4, 11, 0)),
      Title: 'Discovery Flight',
      CustomerName: 'Sophie Brown',
      InstructorName: 'James Wilson',
      AircraftName: 'N172SP - Cessna 172S Skyhawk SP',
    },
    {
      Start: fspLocal(futureDate(4, 15, 0)),
      End: fspLocal(futureDate(4, 17, 0)),
      Title: 'Aircraft Rental',
      CustomerName: 'Tyler Lee',
      InstructorName: '',
      AircraftName: 'N182RG - Cessna 182RG Skylane',
    },
    // Day 5 — 3 events
    {
      Start: fspLocal(futureDate(5, 7, 30)),
      End: fspLocal(futureDate(5, 9, 30)),
      Title: 'Private Pilot Training',
      CustomerName: 'Ryan Martinez',
      InstructorName: 'David Kim',
      AircraftName: 'N152AB - Cessna 152',
    },
    {
      Start: fspLocal(futureDate(5, 10, 0)),
      End: fspLocal(futureDate(5, 11, 30)),
      Title: 'Instrument Training',
      CustomerName: 'Emily Davis',
      InstructorName: 'Lisa Park',
      AircraftName: 'N172SP - Cessna 172S Skyhawk SP',
    },
    {
      Start: fspLocal(futureDate(5, 13, 0)),
      End: fspLocal(futureDate(5, 15, 0)),
      Title: 'Private Pilot Training',
      CustomerName: 'Alex Johnson',
      InstructorName: 'James Wilson',
      AircraftName: 'N172SP - Cessna 172S Skyhawk SP',
    },
    // Day 6 — 2 events (weekend-light)
    {
      Start: fspLocal(futureDate(6, 9, 0)),
      End: fspLocal(futureDate(6, 11, 0)),
      Title: 'Private Pilot Training',
      CustomerName: 'Mia Garcia',
      InstructorName: 'David Kim',
      AircraftName: 'N152AB - Cessna 152',
    },
    {
      Start: fspLocal(futureDate(6, 13, 0)),
      End: fspLocal(futureDate(6, 14, 30)),
      Title: 'Instrument Training',
      CustomerName: 'Emily Davis',
      InstructorName: 'Lisa Park',
      AircraftName: 'N182RG - Cessna 182RG Skylane',
    },
  ];
}

export function generateScheduleResponse(): FspScheduleResponse {
  return {
    results: {
      events: generateScheduleEvents(),
      resources: [],
      unavailability: [],
    },
  };
}

// ─── Reservations ─────────────────────────────────────────────────────────────

let reservationCounter = 100;

/** Produce reservation list items that mirror the schedule events. */
export function generateReservationListItems(): FspReservationListItem[] {
  const events = generateScheduleEvents();
  return events.map((ev, i) => ({
    reservationId: `res-${String(i + 1).padStart(3, '0')}`,
    reservationNumber: ++reservationCounter,
    resource: ev.AircraftName,
    start: ev.Start,
    end: ev.End,
    pilotFirstName: ev.CustomerName.split(' ')[0]!,
    pilotLastName: ev.CustomerName.split(' ')[1] ?? '',
    pilotId:
      MOCK_STUDENTS.find((s) => `${s.firstName} ${s.lastName}` === ev.CustomerName)?.id ??
      'stu-unknown',
    status: 0, // 0 = confirmed
  }));
}

export function generateReservationDetail(reservationId: string): FspReservationDetail {
  const items = generateReservationListItems();
  const item = items.find((r) => r.reservationId === reservationId) ?? items[0]!;
  return {
    id: item.reservationId,
    reservationNumber: item.reservationNumber,
    aircraftId: MOCK_AIRCRAFT.find((a) => item.resource.startsWith(a.registration))?.id ?? 'ac-001',
    instructorId: 'inst-001',
    pilotId: item.pilotId,
    start: item.start,
    end: item.end,
    locationId: 1, // mapped to loc-001 / KPAO
    operatorId: MOCK_OPERATOR_ID,
    status: item.status,
    comments: '',
    internalComments: '',
  };
}

// ─── Enrollments ──────────────────────────────────────────────────────────────

export const MOCK_ENROLLMENTS: Record<string, FspEnrollment[]> = {
  'stu-001': [
    {
      id: 'enr-001',
      studentId: 'stu-001',
      courseId: 'crs-ppl',
      courseName: 'Private Pilot License',
      status: 'active',
    },
  ],
  'stu-002': [
    {
      id: 'enr-002',
      studentId: 'stu-002',
      courseId: 'crs-ir',
      courseName: 'Instrument Rating',
      status: 'active',
    },
  ],
  'stu-003': [
    {
      id: 'enr-003',
      studentId: 'stu-003',
      courseId: 'crs-ppl',
      courseName: 'Private Pilot License',
      status: 'active',
    },
  ],
};

function generateLessons(total: number, completed: number, prefix: string): FspEnrollmentLesson[] {
  const lessons: FspEnrollmentLesson[] = [];
  for (let i = 1; i <= total; i++) {
    lessons.push({
      lessonId: `${prefix}-les-${String(i).padStart(3, '0')}`,
      lessonName: `Lesson ${i}`,
      order: i,
      isCompleted: i <= completed,
    });
  }
  return lessons;
}

export const MOCK_ENROLLMENT_PROGRESS: Record<string, FspEnrollmentProgress> = {
  'enr-001': {
    enrollmentId: 'enr-001',
    completedLessons: 15,
    totalLessons: 40,
    lessons: generateLessons(40, 15, 'ppl'),
  },
  'enr-002': {
    enrollmentId: 'enr-002',
    completedLessons: 8,
    totalLessons: 30,
    lessons: generateLessons(30, 8, 'ir'),
  },
  'enr-003': {
    enrollmentId: 'enr-003',
    completedLessons: 38,
    totalLessons: 40,
    lessons: generateLessons(40, 38, 'ppl2'),
  },
};

// ─── Schedulable Events ───────────────────────────────────────────────────────

export function generateSchedulableEvents(): FspSchedulableEvent[] {
  return [
    {
      eventId: 'sev-001',
      enrollmentId: 'enr-001',
      studentId: 'stu-001',
      studentFirstName: 'Alex',
      studentLastName: 'Johnson',
      courseId: 'crs-ppl',
      courseName: 'Private Pilot License',
      lessonId: 'ppl-les-016',
      lessonName: 'Lesson 16 - Solo Cross Country Prep',
      lessonOrder: 16,
      flightType: 0,
      routeType: 0,
      timeOfDay: 1,
      durationTotal: 120,
      aircraftDurationTotal: 90,
      instructorDurationPre: 15,
      instructorDurationPost: 15,
      instructorDurationTotal: 120,
      instructorRequired: true,
      instructorIds: ['inst-001', 'inst-003'],
      aircraftIds: ['ac-001', 'ac-002'],
      schedulingGroupIds: [],
      meetingRoomIds: [],
      isStageCheck: false,
      reservationTypeId: 'at-001',
      activityTypeId: 'at-001',
    },
    {
      eventId: 'sev-002',
      enrollmentId: 'enr-002',
      studentId: 'stu-002',
      studentFirstName: 'Emily',
      studentLastName: 'Davis',
      courseId: 'crs-ir',
      courseName: 'Instrument Rating',
      lessonId: 'ir-les-009',
      lessonName: 'Lesson 9 - ILS Approaches',
      lessonOrder: 9,
      flightType: 0,
      routeType: 0,
      timeOfDay: 0,
      durationTotal: 120,
      aircraftDurationTotal: 90,
      instructorDurationPre: 15,
      instructorDurationPost: 15,
      instructorDurationTotal: 120,
      instructorRequired: true,
      instructorIds: ['inst-002'],
      aircraftIds: ['ac-001', 'ac-003'],
      schedulingGroupIds: [],
      meetingRoomIds: [],
      isStageCheck: false,
      reservationTypeId: 'at-002',
      activityTypeId: 'at-002',
    },
    {
      eventId: 'sev-003',
      enrollmentId: 'enr-003',
      studentId: 'stu-003',
      studentFirstName: 'Ryan',
      studentLastName: 'Martinez',
      courseId: 'crs-ppl',
      courseName: 'Private Pilot License',
      lessonId: 'ppl2-les-039',
      lessonName: 'Lesson 39 - Checkride Prep',
      lessonOrder: 39,
      flightType: 0,
      routeType: 0,
      timeOfDay: 1,
      durationTotal: 120,
      aircraftDurationTotal: 90,
      instructorDurationPre: 15,
      instructorDurationPost: 15,
      instructorDurationTotal: 120,
      instructorRequired: true,
      instructorIds: ['inst-001', 'inst-003'],
      aircraftIds: ['ac-001', 'ac-002'],
      schedulingGroupIds: [],
      meetingRoomIds: [],
      isStageCheck: true,
      reservationTypeId: 'at-001',
      activityTypeId: 'at-001',
    },
    {
      eventId: 'sev-004',
      enrollmentId: 'enr-001',
      studentId: 'stu-001',
      studentFirstName: 'Alex',
      studentLastName: 'Johnson',
      courseId: 'crs-ppl',
      courseName: 'Private Pilot License',
      lessonId: 'ppl-les-017',
      lessonName: 'Lesson 17 - Solo Cross Country',
      lessonOrder: 17,
      flightType: 1,
      routeType: 1,
      timeOfDay: 1,
      durationTotal: 180,
      aircraftDurationTotal: 150,
      instructorDurationPre: 15,
      instructorDurationPost: 15,
      instructorDurationTotal: 30,
      instructorRequired: false,
      instructorIds: [],
      aircraftIds: ['ac-001', 'ac-002'],
      schedulingGroupIds: [],
      meetingRoomIds: [],
      isStageCheck: false,
      reservationTypeId: 'at-001',
      activityTypeId: 'at-001',
    },
    {
      eventId: 'sev-005',
      enrollmentId: 'enr-002',
      studentId: 'stu-002',
      studentFirstName: 'Emily',
      studentLastName: 'Davis',
      courseId: 'crs-ir',
      courseName: 'Instrument Rating',
      lessonId: 'ir-les-010',
      lessonName: 'Lesson 10 - VOR/DME Approaches',
      lessonOrder: 10,
      flightType: 0,
      routeType: 0,
      timeOfDay: 0,
      durationTotal: 120,
      aircraftDurationTotal: 90,
      instructorDurationPre: 15,
      instructorDurationPost: 15,
      instructorDurationTotal: 120,
      instructorRequired: true,
      instructorIds: ['inst-002'],
      aircraftIds: ['ac-001', 'ac-003'],
      schedulingGroupIds: [],
      meetingRoomIds: [],
      isStageCheck: false,
      reservationTypeId: 'at-002',
      activityTypeId: 'at-002',
    },
    {
      eventId: 'sev-006',
      enrollmentId: 'enr-003',
      studentId: 'stu-003',
      studentFirstName: 'Ryan',
      studentLastName: 'Martinez',
      courseId: 'crs-ppl',
      courseName: 'Private Pilot License',
      lessonId: 'ppl2-les-040',
      lessonName: 'Lesson 40 - Final Checkride',
      lessonOrder: 40,
      flightType: 0,
      routeType: 0,
      timeOfDay: 1,
      durationTotal: 150,
      aircraftDurationTotal: 120,
      instructorDurationPre: 15,
      instructorDurationPost: 15,
      instructorDurationTotal: 150,
      instructorRequired: true,
      instructorIds: ['inst-001'],
      aircraftIds: ['ac-001'],
      schedulingGroupIds: [],
      meetingRoomIds: [],
      isStageCheck: true,
      reservationTypeId: 'at-001',
      activityTypeId: 'at-001',
    },
    {
      eventId: 'sev-007',
      enrollmentId: 'enr-001',
      studentId: 'stu-001',
      studentFirstName: 'Alex',
      studentLastName: 'Johnson',
      courseId: 'crs-ppl',
      courseName: 'Private Pilot License',
      lessonId: 'ppl-les-018',
      lessonName: 'Lesson 18 - Night Flying Intro',
      lessonOrder: 18,
      flightType: 0,
      routeType: 0,
      timeOfDay: 2,
      durationTotal: 120,
      aircraftDurationTotal: 90,
      instructorDurationPre: 15,
      instructorDurationPost: 15,
      instructorDurationTotal: 120,
      instructorRequired: true,
      instructorIds: ['inst-001', 'inst-003'],
      aircraftIds: ['ac-001'],
      schedulingGroupIds: [],
      meetingRoomIds: [],
      isStageCheck: false,
      reservationTypeId: 'at-001',
      activityTypeId: 'at-001',
    },
  ];
}

// ─── Civil Twilight ───────────────────────────────────────────────────────────

/** Realistic civil twilight for KPAO area (Bay Area, CA). */
export function generateCivilTwilight(): FspCivilTwilight {
  const today = new Date();
  const dawn = new Date(today);
  dawn.setHours(6, 30, 0, 0);
  const dusk = new Date(today);
  dusk.setHours(19, 30, 0, 0);
  return {
    startDate: fspLocal(dawn),
    endDate: fspLocal(dusk),
  };
}

// ─── Availability ─────────────────────────────────────────────────────────────

function weekdayAvail(startHour: number, endHour: number): FspAvailabilityEntry[] {
  const entries: FspAvailabilityEntry[] = [];
  // Monday(1) through Friday(5)
  for (let dow = 1; dow <= 5; dow++) {
    entries.push({
      dayOfWeek: dow,
      startAtTimeUtc: `${String(startHour).padStart(2, '0')}:00:00`,
      endAtTimeUtc: `${String(endHour).padStart(2, '0')}:00:00`,
    });
  }
  return entries;
}

export const MOCK_AVAILABILITY: Record<string, FspAvailability> = {
  // Instructor availability
  'inst-001': {
    userGuidId: 'inst-001',
    availabilities: weekdayAvail(7, 17),
    availabilityOverrides: [
      // Personal day — 5 days from now
      {
        date: isoDate(futureDate(5, 0)),
        startTime: '07:00:00',
        endTime: '17:00:00',
        isUnavailable: true,
      },
    ],
  },
  'inst-002': {
    userGuidId: 'inst-002',
    availabilities: [
      ...weekdayAvail(8, 18),
      // Saturday morning
      { dayOfWeek: 6, startAtTimeUtc: '09:00:00', endAtTimeUtc: '13:00:00' },
    ],
    availabilityOverrides: [],
  },
  'inst-003': {
    userGuidId: 'inst-003',
    availabilities: [
      ...weekdayAvail(7, 15),
      // Also has evening Tuesday / Thursday
      { dayOfWeek: 2, startAtTimeUtc: '17:00:00', endAtTimeUtc: '20:00:00' },
      { dayOfWeek: 4, startAtTimeUtc: '17:00:00', endAtTimeUtc: '20:00:00' },
    ],
    availabilityOverrides: [
      // Doctor appointment — 3 days from now (morning only)
      {
        date: isoDate(futureDate(3, 0)),
        startTime: '07:00:00',
        endTime: '12:00:00',
        isUnavailable: true,
      },
    ],
  },
  // Tina Nguyen: weekdays 9am-2pm only (part-time)
  'inst-004': {
    userGuidId: 'inst-004',
    availabilities: weekdayAvail(9, 14),
    availabilityOverrides: [],
  },
  // Marcus Rivera: Wed-Sun 10am-6pm (weekend warrior)
  'inst-005': {
    userGuidId: 'inst-005',
    availabilities: [
      { dayOfWeek: 3, startAtTimeUtc: '10:00:00', endAtTimeUtc: '18:00:00' }, // Wed
      { dayOfWeek: 4, startAtTimeUtc: '10:00:00', endAtTimeUtc: '18:00:00' }, // Thu
      { dayOfWeek: 5, startAtTimeUtc: '10:00:00', endAtTimeUtc: '18:00:00' }, // Fri
      { dayOfWeek: 6, startAtTimeUtc: '10:00:00', endAtTimeUtc: '18:00:00' }, // Sat
      { dayOfWeek: 0, startAtTimeUtc: '10:00:00', endAtTimeUtc: '18:00:00' }, // Sun
    ],
    availabilityOverrides: [],
  },
  // Student availability
  'stu-001': {
    userGuidId: 'stu-001',
    availabilities: weekdayAvail(8, 17),
    availabilityOverrides: [],
  },
  'stu-002': {
    userGuidId: 'stu-002',
    availabilities: [
      ...weekdayAvail(9, 18),
      { dayOfWeek: 6, startAtTimeUtc: '08:00:00', endAtTimeUtc: '14:00:00' },
    ],
    availabilityOverrides: [],
  },
  'stu-003': {
    userGuidId: 'stu-003',
    availabilities: weekdayAvail(7, 16),
    availabilityOverrides: [],
  },
  'stu-004': {
    userGuidId: 'stu-004',
    availabilities: weekdayAvail(10, 18),
    availabilityOverrides: [],
  },
  'stu-005': {
    userGuidId: 'stu-005',
    availabilities: [
      ...weekdayAvail(8, 15),
      { dayOfWeek: 0, startAtTimeUtc: '09:00:00', endAtTimeUtc: '13:00:00' },
    ],
    availabilityOverrides: [],
  },
  'stu-006': {
    userGuidId: 'stu-006',
    availabilities: weekdayAvail(8, 17),
    availabilityOverrides: [],
  },
};

// ─── Availability Overrides (Time Off) ───────────────────────────────────────

export interface MockAvailabilityOverrideEntry {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  isUnavailable: boolean;
  reason?: string;
}

export const MOCK_AVAILABILITY_OVERRIDES: Record<string, MockAvailabilityOverrideEntry[]> = {
  'inst-001': [
    {
      id: 'avo-001',
      date: isoDate(futureDate(5, 0)),
      startTime: fspLocal(futureDate(5, 7, 0)),
      endTime: fspLocal(futureDate(5, 17, 0)),
      isUnavailable: true,
      reason: 'Personal day',
    },
  ],
  'inst-002': [],
  'inst-003': [
    {
      id: 'avo-002',
      date: isoDate(futureDate(3, 0)),
      startTime: fspLocal(futureDate(3, 7, 0)),
      endTime: fspLocal(futureDate(3, 12, 0)),
      isUnavailable: true,
      reason: 'Doctor appointment',
    },
  ],
  'inst-004': [],
  'inst-005': [],
};

// ─── Aircraft Times / Squawks / Maintenance ──────────────────────────────────

export const MOCK_AIRCRAFT_TIMES: Record<
  string,
  {
    aircraftId: string;
    totalTime: number;
    hobbs: number;
    tach: number;
    lastFlightDate: string;
  }
> = {
  'ac-001': {
    aircraftId: 'ac-001',
    totalTime: 4520.3,
    hobbs: 4520.3,
    tach: 3890.1,
    lastFlightDate: fspLocal(futureDate(0, 16, 0)),
  },
  'ac-002': {
    aircraftId: 'ac-002',
    totalTime: 8210.7,
    hobbs: 8210.7,
    tach: 7105.2,
    lastFlightDate: fspLocal(futureDate(0, 14, 30)),
  },
  'ac-003': {
    aircraftId: 'ac-003',
    totalTime: 3150.5,
    hobbs: 3150.5,
    tach: 2890.8,
    lastFlightDate: fspLocal(futureDate(-1, 17, 0)),
  },
  'ac-004': {
    aircraftId: 'ac-004',
    totalTime: 1200.0,
    hobbs: 1200.0,
    tach: 1200.0,
    lastFlightDate: fspLocal(futureDate(0, 18, 0)),
  },
};

export const MOCK_AIRCRAFT_SQUAWKS: Record<
  string,
  Array<{
    id: string;
    aircraftId: string;
    description: string;
    reportedBy: string;
    reportedDate: string;
    status: string;
    severity: string;
  }>
> = {
  'ac-001': [
    {
      id: 'sqk-001',
      aircraftId: 'ac-001',
      description: 'Slight vibration in right rudder pedal at taxi speed',
      reportedBy: 'James Wilson',
      reportedDate: fspLocal(futureDate(-3, 10, 0)),
      status: 'deferred',
      severity: 'non-grounding',
    },
  ],
  'ac-002': [],
  'ac-003': [
    {
      id: 'sqk-002',
      aircraftId: 'ac-003',
      description: 'GPS database expired — needs NavData update',
      reportedBy: 'Lisa Park',
      reportedDate: fspLocal(futureDate(-2, 9, 0)),
      status: 'open',
      severity: 'non-grounding',
    },
  ],
  'ac-004': [],
};

export const MOCK_MAINTENANCE_REMINDERS: Record<
  string,
  Array<{
    id: string;
    aircraftId: string;
    type: string;
    description: string;
    dueDate: string | null;
    dueHobbs: number | null;
    currentHobbs: number;
    remainingHours: number | null;
    status: string;
  }>
> = {
  'ac-001': [
    {
      id: 'maint-001',
      aircraftId: 'ac-001',
      type: '100-hour',
      description: '100-hour inspection',
      dueDate: null,
      dueHobbs: 4600,
      currentHobbs: 4520.3,
      remainingHours: 79.7,
      status: 'upcoming',
    },
    {
      id: 'maint-002',
      aircraftId: 'ac-001',
      type: 'annual',
      description: 'Annual inspection',
      dueDate: fspLocal(futureDate(45, 8, 0)),
      dueHobbs: null,
      currentHobbs: 4520.3,
      remainingHours: null,
      status: 'upcoming',
    },
  ],
  'ac-002': [
    {
      id: 'maint-003',
      aircraftId: 'ac-002',
      type: '100-hour',
      description: '100-hour inspection',
      dueDate: null,
      dueHobbs: 8250,
      currentHobbs: 8210.7,
      remainingHours: 39.3,
      status: 'due_soon',
    },
  ],
  'ac-003': [
    {
      id: 'maint-004',
      aircraftId: 'ac-003',
      type: 'oil_change',
      description: 'Oil and filter change',
      dueDate: null,
      dueHobbs: 3200,
      currentHobbs: 3150.5,
      remainingHours: 49.5,
      status: 'upcoming',
    },
  ],
  'ac-004': [],
};

// ─── Schedule Filters & Cancellation Reasons ─────────────────────────────────

export const MOCK_SCHEDULE_FILTERS = {
  instructors: MOCK_INSTRUCTORS.map((i) => ({ id: i.id, name: i.fullName, isActive: i.isActive })),
  aircraft: MOCK_AIRCRAFT.map((a) => ({
    id: a.id,
    name: `${a.registration} - ${a.makeModel}`,
    isActive: a.isActive,
  })),
  activityTypes: MOCK_ACTIVITY_TYPES.map((at) => ({
    id: at.id,
    name: at.name,
    isActive: at.isActive,
  })),
  locations: MOCK_LOCATIONS.map((l) => ({ id: l.id, name: l.name, isActive: l.isActive })),
};

export const MOCK_CANCELLATION_REASONS = [
  { id: 'cr-001', name: 'Weather', isActive: true },
  { id: 'cr-002', name: 'Student no-show', isActive: true },
  { id: 'cr-003', name: 'Student request', isActive: true },
  { id: 'cr-004', name: 'Instructor unavailable', isActive: true },
  { id: 'cr-005', name: 'Aircraft maintenance', isActive: true },
  { id: 'cr-006', name: 'Other', isActive: true },
];

// ─── AutoSchedule ────────────────────────────────────────────────────────────

export const MOCK_AUTOSCHEDULE_SETTINGS = {
  minutesBetweenEvents: 0,
  percentageUtilized: 100,
  reservationStaggerGroups: 2,
  schedulingWindowStart: '04:00',
  schedulingWindowEnd: '21:00',
  staggerOffsetTime: 30,
  useAllInstructors: false,
};

/** Generate AutoSchedule results from submitted events or fallback to schedulable events. */
export function generateAutoScheduleResults(requestBody?: {
  events?: Array<{ eventId: string; customer1Guid?: string }>;
}) {
  const schedulable = generateSchedulableEvents();
  const sourceEvents = requestBody?.events;
  const eventsToPlace =
    sourceEvents && sourceEvents.length > 0
      ? sourceEvents
      : schedulable.map((e) => ({ eventId: e.eventId, customer1Guid: e.studentId }));

  return {
    events: eventsToPlace.map((ev, i) => {
      const se =
        schedulable.find((s) => s.eventId === ev.eventId) ?? schedulable[i % schedulable.length]!;
      return {
        eventId: ev.eventId,
        customerId: ev.customer1Guid ?? se.studentId,
        instructorId: se.instructorIds[0] ?? MOCK_INSTRUCTORS[i % MOCK_INSTRUCTORS.length]!.id,
        aircraftId: se.aircraftIds[0] ?? MOCK_AIRCRAFT[i % 3]!.id,
        success: true,
        startTime: fspLocal(futureDate(1 + Math.floor(i / 3), 8 + (i % 3) * 3, 0)),
        endTime: fspLocal(futureDate(1 + Math.floor(i / 3), 10 + (i % 3) * 3, 0)),
        error: null,
      };
    }),
  };
}

// ─── Find-a-Time ─────────────────────────────────────────────────────────────

export const MOCK_FIND_TIME_PREFERENCES = {
  defaultDurationMinutes: 120,
  defaultInstructorPreMinutes: 15,
  defaultInstructorPostMinutes: 15,
  preferredTimeOfDay: 'morning',
  includeWeekends: false,
  maxResults: 10,
};

/** Generate available time slots for Find-a-Time. */
export function generateFindTimeSlots() {
  return [
    {
      startTime: fspLocal(futureDate(1, 8, 0)),
      endTime: fspLocal(futureDate(1, 10, 0)),
      instructorId: 'inst-001',
      instructorName: 'James Wilson',
      aircraftId: 'ac-001',
      aircraftName: 'N172SP',
      score: 95,
    },
    {
      startTime: fspLocal(futureDate(1, 14, 0)),
      endTime: fspLocal(futureDate(1, 16, 0)),
      instructorId: 'inst-002',
      instructorName: 'Lisa Park',
      aircraftId: 'ac-001',
      aircraftName: 'N172SP',
      score: 88,
    },
    {
      startTime: fspLocal(futureDate(2, 9, 0)),
      endTime: fspLocal(futureDate(2, 11, 0)),
      instructorId: 'inst-003',
      instructorName: 'David Kim',
      aircraftId: 'ac-002',
      aircraftName: 'N152AB',
      score: 82,
    },
    {
      startTime: fspLocal(futureDate(2, 13, 0)),
      endTime: fspLocal(futureDate(2, 15, 0)),
      instructorId: 'inst-001',
      instructorName: 'James Wilson',
      aircraftId: 'ac-003',
      aircraftName: 'N182RG',
      score: 78,
    },
    {
      startTime: fspLocal(futureDate(3, 10, 0)),
      endTime: fspLocal(futureDate(3, 12, 0)),
      instructorId: 'inst-002',
      instructorName: 'Lisa Park',
      aircraftId: 'ac-001',
      aircraftName: 'N172SP',
      score: 75,
    },
  ];
}

// ─── Batch Reservations ──────────────────────────────────────────────────────

let batchCounter = 0;

export function generateBatchId(): string {
  return `batch-${++batchCounter}-${Date.now()}`;
}

export function generateBatchStatus(batchId: string, totalCount = 5) {
  return {
    batchId,
    status: 'completed',
    totalCount,
    completedCount: totalCount,
    failedCount: 0,
    results: Array.from({ length: totalCount }, (_, i) => ({
      eventId: `sev-${String(i + 1).padStart(3, '0')}`,
      reservationId: `batch-res-${String(i + 1).padStart(3, '0')}`,
      success: true,
      error: null,
    })),
  };
}

// ─── Enrollment Details ──────────────────────────────────────────────────────

export const MOCK_ENROLLMENT_DETAILS: Record<
  string,
  {
    id: string;
    studentId: string;
    courseId: string;
    courseName: string;
    status: string;
    startDate: string;
    expectedCompletionDate: string;
    instructorId: string;
    locationId: string;
  }
> = {
  'enr-001': {
    id: 'enr-001',
    studentId: 'stu-001',
    courseId: 'crs-ppl',
    courseName: 'Private Pilot License',
    status: 'active',
    startDate: fspLocal(futureDate(-90, 8, 0)),
    expectedCompletionDate: fspLocal(futureDate(30, 8, 0)),
    instructorId: 'inst-001',
    locationId: 'loc-001',
  },
  'enr-002': {
    id: 'enr-002',
    studentId: 'stu-002',
    courseId: 'crs-ir',
    courseName: 'Instrument Rating',
    status: 'active',
    startDate: fspLocal(futureDate(-60, 8, 0)),
    expectedCompletionDate: fspLocal(futureDate(60, 8, 0)),
    instructorId: 'inst-002',
    locationId: 'loc-001',
  },
  'enr-003': {
    id: 'enr-003',
    studentId: 'stu-003',
    courseId: 'crs-ppl',
    courseName: 'Private Pilot License',
    status: 'active',
    startDate: fspLocal(futureDate(-180, 8, 0)),
    expectedCompletionDate: fspLocal(futureDate(7, 8, 0)),
    instructorId: 'inst-001',
    locationId: 'loc-001',
  },
};

// ─── Training Sessions ──────────────────────────────────────────────────────

export function generateTrainingSessions(enrollmentId?: string) {
  const enrId = enrollmentId ?? 'enr-001';
  const studentId = enrId === 'enr-001' ? 'stu-001' : enrId === 'enr-002' ? 'stu-002' : 'stu-003';
  const isIR = enrId === 'enr-002';
  return [
    {
      id: `ts-${enrId}-001`,
      enrollmentId: enrId,
      studentId,
      lessonId: isIR ? 'ir-les-008' : 'ppl-les-015',
      lessonName: isIR ? 'Lesson 8 - Holding Patterns' : 'Lesson 15 - Cross Country Planning',
      date: fspLocal(futureDate(-3, 9, 0)),
      duration: 120,
      instructorId: isIR ? 'inst-002' : 'inst-001',
      aircraftId: isIR ? 'ac-003' : 'ac-001',
      status: 'completed',
      grade: 'satisfactory',
    },
    {
      id: `ts-${enrId}-002`,
      enrollmentId: enrId,
      studentId,
      lessonId: isIR ? 'ir-les-007' : 'ppl-les-014',
      lessonName: isIR ? 'Lesson 7 - VOR Navigation' : 'Lesson 14 - Solo Practice',
      date: fspLocal(futureDate(-7, 10, 0)),
      duration: 120,
      instructorId: isIR ? 'inst-002' : 'inst-001',
      aircraftId: isIR ? 'ac-003' : 'ac-001',
      status: 'completed',
      grade: 'satisfactory',
    },
    {
      id: `ts-${enrId}-003`,
      enrollmentId: enrId,
      studentId,
      lessonId: isIR ? 'ir-les-006' : 'ppl-les-013',
      lessonName: isIR ? 'Lesson 6 - Partial Panel' : 'Lesson 13 - Steep Turns',
      date: fspLocal(futureDate(-10, 8, 0)),
      duration: 90,
      instructorId: isIR ? 'inst-002' : 'inst-001',
      aircraftId: isIR ? 'ac-003' : 'ac-001',
      status: 'completed',
      grade: 'satisfactory',
    },
  ];
}

// ─── Student Progress Report ─────────────────────────────────────────────────

export function generateStudentProgressReport(enrollmentId?: string) {
  const progress = MOCK_ENROLLMENT_PROGRESS[enrollmentId ?? 'enr-001'];
  if (!progress)
    return { enrollmentId: enrollmentId ?? 'enr-001', completionPercentage: 0, milestones: [] };
  return {
    enrollmentId: progress.enrollmentId,
    completionPercentage: Math.round((progress.completedLessons / progress.totalLessons) * 100),
    completedLessons: progress.completedLessons,
    totalLessons: progress.totalLessons,
    milestones: [
      {
        name: 'First Solo',
        status: progress.completedLessons >= 15 ? 'completed' : 'pending',
        lessonOrder: 15,
      },
      {
        name: 'Solo Cross Country',
        status: progress.completedLessons >= 25 ? 'completed' : 'pending',
        lessonOrder: 25,
      },
      {
        name: 'Checkride Prep',
        status: progress.completedLessons >= 38 ? 'completed' : 'pending',
        lessonOrder: 38,
      },
      {
        name: 'Checkride',
        status: progress.completedLessons >= 40 ? 'completed' : 'pending',
        lessonOrder: 40,
      },
    ],
    averageGrade: 'satisfactory',
    lastFlightDate: fspLocal(futureDate(-3, 16, 0)),
  };
}

// ─── Checkride Exam Scores ──────────────────────────────────────────────────

export const MOCK_CHECKRIDE_SCORES = [
  {
    id: 'crs-001',
    studentId: 'stu-003',
    studentName: 'Ryan Martinez',
    examType: 'private_pilot',
    date: fspLocal(futureDate(-10, 9, 0)),
    result: 'pending',
    score: null,
    examinerId: 'ext-dpe-001',
    examinerName: 'Robert Chen (DPE)',
  },
];

// ─── Knowledge Tests ─────────────────────────────────────────────────────────

export const MOCK_KNOWLEDGE_TESTS = [
  {
    id: 'kt-001',
    studentId: 'stu-001',
    studentName: 'Alex Johnson',
    testType: 'PAR',
    testName: 'Private Pilot Airplane',
    date: fspLocal(futureDate(-30, 10, 0)),
    score: 87,
    passingScore: 70,
    passed: true,
    expirationDate: fspLocal(futureDate(335, 10, 0)),
  },
  {
    id: 'kt-002',
    studentId: 'stu-002',
    studentName: 'Emily Davis',
    testType: 'IRA',
    testName: 'Instrument Rating Airplane',
    date: fspLocal(futureDate(-15, 14, 0)),
    score: 92,
    passingScore: 70,
    passed: true,
    expirationDate: fspLocal(futureDate(350, 14, 0)),
  },
  {
    id: 'kt-003',
    studentId: 'stu-003',
    studentName: 'Ryan Martinez',
    testType: 'PAR',
    testName: 'Private Pilot Airplane',
    date: fspLocal(futureDate(-45, 10, 0)),
    score: 91,
    passingScore: 70,
    passed: true,
    expirationDate: fspLocal(futureDate(320, 10, 0)),
  },
];

// ─── Student Dropdown Items ──────────────────────────────────────────────────

export function generateStudentDropdownItems() {
  return MOCK_STUDENTS.map((s) => ({
    id: s.id,
    name: s.fullName ?? `${s.firstName} ${s.lastName}`,
    email: s.email,
  }));
}

// ─── Training Alerts ─────────────────────────────────────────────────────────

export const MOCK_TRAINING_ALERTS = [
  {
    id: 'ta-001',
    studentId: 'stu-003',
    studentName: 'Ryan Martinez',
    type: 'checkride_approaching',
    message: 'Ryan Martinez is at lesson 38/40 — checkride prep imminent',
    severity: 'info',
    createdAt: fspLocal(futureDate(-1, 8, 0)),
  },
  {
    id: 'ta-002',
    studentId: 'stu-001',
    studentName: 'Alex Johnson',
    type: 'knowledge_test_expiring',
    message: 'Alex Johnson PAR knowledge test expires in 335 days',
    severity: 'low',
    createdAt: fspLocal(futureDate(-2, 9, 0)),
  },
  {
    id: 'ta-003',
    studentId: 'stu-004',
    studentName: 'Sophie Brown',
    type: 'no_recent_flight',
    message: 'Sophie Brown has not flown in 14 days — currency at risk',
    severity: 'warning',
    createdAt: fspLocal(futureDate(0, 6, 0)),
  },
];

// ─── Flight Alerts ───────────────────────────────────────────────────────────

export const MOCK_FLIGHT_ALERTS = [
  {
    id: 'fa-001',
    reservationId: 'res-001',
    operatorId: MOCK_OPERATOR_ID,
    aircraftId: 'ac-001',
    aircraftName: 'N172SP',
    pilotId: 'stu-001',
    pilotName: 'Alex Johnson',
    instructorId: 'inst-001',
    instructorName: 'James Wilson',
    type: 'departure',
    scheduledTime: fspLocal(futureDate(0, 8, 0)),
    status: 'acknowledged',
    createdAt: fspLocal(futureDate(0, 7, 30)),
  },
  {
    id: 'fa-002',
    reservationId: 'res-002',
    operatorId: MOCK_OPERATOR_ID,
    aircraftId: 'ac-001',
    aircraftName: 'N172SP',
    pilotId: 'stu-001',
    pilotName: 'Alex Johnson',
    instructorId: 'inst-001',
    instructorName: 'James Wilson',
    type: 'arrival',
    scheduledTime: fspLocal(futureDate(0, 10, 0)),
    status: 'pending',
    createdAt: fspLocal(futureDate(0, 7, 30)),
  },
  {
    id: 'fa-003',
    reservationId: 'res-003',
    operatorId: MOCK_OPERATOR_ID,
    aircraftId: 'ac-002',
    aircraftName: 'N152AB',
    pilotId: 'stu-003',
    pilotName: 'Ryan Martinez',
    instructorId: 'inst-003',
    instructorName: 'David Kim',
    type: 'departure',
    scheduledTime: fspLocal(futureDate(-1, 7, 0)),
    status: 'overdue',
    createdAt: fspLocal(futureDate(-1, 6, 30)),
  },
  {
    id: 'fa-004',
    reservationId: 'res-004',
    operatorId: MOCK_OPERATOR_ID,
    aircraftId: 'ac-003',
    aircraftName: 'N182RG',
    pilotId: 'stu-002',
    pilotName: 'Emily Davis',
    instructorId: 'inst-002',
    instructorName: 'Lisa Park',
    type: 'arrival',
    scheduledTime: fspLocal(futureDate(0, 16, 0)),
    status: 'pending',
    createdAt: fspLocal(futureDate(0, 14, 0)),
  },
];

// ─── Available Times for Reservations ────────────────────────────────────────

export function generateAvailableTimes() {
  return [
    { start: fspLocal(futureDate(1, 8, 0)), end: fspLocal(futureDate(1, 10, 0)) },
    { start: fspLocal(futureDate(1, 10, 30)), end: fspLocal(futureDate(1, 12, 30)) },
    { start: fspLocal(futureDate(1, 13, 0)), end: fspLocal(futureDate(1, 15, 0)) },
    { start: fspLocal(futureDate(2, 8, 0)), end: fspLocal(futureDate(2, 10, 0)) },
    { start: fspLocal(futureDate(2, 14, 0)), end: fspLocal(futureDate(2, 16, 0)) },
  ];
}

// ─── Enrollment History ──────────────────────────────────────────────────────

export function generateEnrollmentHistory() {
  return [
    {
      date: fspLocal(futureDate(-90, 9, 0)),
      action: 'enrolled',
      details: 'Student enrolled in program',
      performedBy: 'Sarah Chen',
    },
    {
      date: fspLocal(futureDate(-60, 9, 0)),
      action: 'milestone_reached',
      details: 'First solo flight completed',
      performedBy: 'James Wilson',
    },
    {
      date: fspLocal(futureDate(-30, 9, 0)),
      action: 'milestone_reached',
      details: 'Solo cross-country completed',
      performedBy: 'James Wilson',
    },
  ];
}

// ═════════════════════════════════════════════════════════════════════════════
// MULTI-TENANT: Operators 1002 & 1003
// ═════════════════════════════════════════════════════════════════════════════

// ─── All Operators ──────────────────────────────────────────────────────────

export const MOCK_OPERATOR_IDS = [1001, 1002, 1003] as const;

export const MOCK_ALL_OPERATORS: FspOperator[] = [
  MOCK_OPERATOR,
  { id: 1002, name: 'Bay Area Flight Training', isActive: true, isPending: false },
  { id: 1003, name: 'Pacific Coast Aviation', isActive: true, isPending: false },
];

export const MOCK_ALL_OPERATOR_DETAILS: Record<number, FspOperatorDetail> = {
  1001: MOCK_OPERATOR_DETAIL,
  1002: {
    id: 1002,
    name: 'Bay Area Flight Training',
    isActive: true,
    isPending: false,
    userId: 'usr-101',
    firstName: 'John',
    lastName: 'Rivera',
    email: 'john@bayareaflight.com',
  },
  1003: {
    id: 1003,
    name: 'Pacific Coast Aviation',
    isActive: true,
    isPending: false,
    userId: 'usr-201',
    firstName: 'Maria',
    lastName: 'Santos',
    email: 'maria@pacificcoast.aero',
  },
};

// ─── Per-Operator Users ─────────────────────────────────────────────────────

export const MOCK_USERS_BY_OPERATOR: Record<number, FspUser[]> = {
  1001: MOCK_USERS,
  1002: [
    {
      id: 'usr-101',
      firstName: 'John',
      lastName: 'Rivera',
      fullName: 'John Rivera',
      email: 'john@bayareaflight.com',
      role: 'scheduler',
      isActive: true,
    },
    {
      id: 'usr-102',
      firstName: 'Anna',
      lastName: 'Kowalski',
      fullName: 'Anna Kowalski',
      email: 'anna@bayareaflight.com',
      role: 'admin',
      isActive: true,
    },
  ],
  1003: [
    {
      id: 'usr-201',
      firstName: 'Maria',
      lastName: 'Santos',
      fullName: 'Maria Santos',
      email: 'maria@pacificcoast.aero',
      role: 'scheduler',
      isActive: true,
    },
  ],
};

// ─── Per-Operator Login Responses ───────────────────────────────────────────

export const MOCK_LOGIN_BY_EMAIL: Record<string, { login: FspLoginResponse; operatorId: number }> =
  {
    'sarah@skywest.edu': {
      login: MOCK_LOGIN_RESPONSE,
      operatorId: 1001,
    },
    'john@bayareaflight.com': {
      login: {
        token: 'mock-jwt-token-bayarea-fsp-2024',
        user: {
          email: 'john@bayareaflight.com',
          id: 'usr-101',
          firstName: 'John',
          lastName: 'Rivera',
        },
        mfaRequired: false,
      },
      operatorId: 1002,
    },
    'maria@pacificcoast.aero': {
      login: {
        token: 'mock-jwt-token-pacific-fsp-2024',
        user: {
          email: 'maria@pacificcoast.aero',
          id: 'usr-201',
          firstName: 'Maria',
          lastName: 'Santos',
        },
        mfaRequired: false,
      },
      operatorId: 1003,
    },
  };

// ─── Per-Operator Locations ─────────────────────────────────────────────────

export const MOCK_LOCATIONS_BY_OPERATOR: Record<number, FspLocation[]> = {
  1001: MOCK_LOCATIONS,
  1002: [
    {
      id: 'loc-101',
      name: 'KSQL - San Carlos Airport',
      code: 'KSQL',
      timeZone: 'America/Los_Angeles',
      isActive: true,
      latitude: 37.5118,
      longitude: -122.2495,
    },
  ],
  1003: [
    {
      id: 'loc-201',
      name: 'KHWD - Hayward Executive Airport',
      code: 'KHWD',
      timeZone: 'America/Los_Angeles',
      isActive: true,
      latitude: 37.659,
      longitude: -122.1217,
    },
  ],
};

// ─── Per-Operator Aircraft ──────────────────────────────────────────────────

export const MOCK_AIRCRAFT_BY_OPERATOR: Record<number, FspAircraft[]> = {
  1001: MOCK_AIRCRAFT,
  1002: [
    {
      id: 'ac-101',
      registration: 'N738JV',
      make: 'Cessna',
      model: '172R Skyhawk',
      makeModel: 'Cessna 172R Skyhawk',
      isActive: true,
      isSimulator: false,
    },
    {
      id: 'ac-102',
      registration: 'N5412G',
      make: 'Piper',
      model: 'PA-28-181 Archer III',
      makeModel: 'Piper PA-28-181 Archer III',
      isActive: true,
      isSimulator: false,
    },
    {
      id: 'ac-103',
      registration: 'N611DS',
      make: 'Diamond',
      model: 'DA40 Star',
      makeModel: 'Diamond DA40 Star',
      isActive: true,
      isSimulator: false,
    },
  ],
  1003: [
    {
      id: 'ac-201',
      registration: 'N921PC',
      make: 'Cessna',
      model: '172S Skyhawk SP',
      makeModel: 'Cessna 172S Skyhawk SP',
      isActive: true,
      isSimulator: false,
    },
    {
      id: 'ac-202',
      registration: 'N340PC',
      make: 'Cessna',
      model: '152',
      makeModel: 'Cessna 152',
      isActive: true,
      isSimulator: false,
    },
  ],
};

// ─── Per-Operator Instructors ───────────────────────────────────────────────

export const MOCK_INSTRUCTORS_BY_OPERATOR: Record<number, FspInstructor[]> = {
  1001: MOCK_INSTRUCTORS,
  1002: [
    {
      id: 'inst-101',
      firstName: 'Carlos',
      lastName: 'Mendez',
      fullName: 'Carlos Mendez',
      instructorType: 'CFI',
      isActive: true,
    },
    {
      id: 'inst-102',
      firstName: 'Priya',
      lastName: 'Sharma',
      fullName: 'Priya Sharma',
      instructorType: 'CFII',
      isActive: true,
    },
  ],
  1003: [
    {
      id: 'inst-201',
      firstName: 'Kevin',
      lastName: 'Tanaka',
      fullName: 'Kevin Tanaka',
      instructorType: 'CFI',
      isActive: true,
    },
  ],
};

// ─── Per-Operator Students ──────────────────────────────────────────────────

export const MOCK_STUDENTS_BY_OPERATOR: Record<number, FspStudent[]> = {
  1001: MOCK_STUDENTS,
  1002: [
    {
      id: 'stu-101',
      firstName: 'Daniel',
      lastName: 'Okafor',
      fullName: 'Daniel Okafor',
      email: 'daniel.o@email.com',
    },
    {
      id: 'stu-102',
      firstName: 'Rachel',
      lastName: 'Nguyen',
      fullName: 'Rachel Nguyen',
      email: 'rachel.n@email.com',
    },
    {
      id: 'stu-103',
      firstName: 'Marcus',
      lastName: 'Thompson',
      fullName: 'Marcus Thompson',
      email: 'marcus.t@email.com',
    },
  ],
  1003: [
    {
      id: 'stu-201',
      firstName: 'Aisha',
      lastName: 'Patel',
      fullName: 'Aisha Patel',
      email: 'aisha.p@email.com',
    },
    {
      id: 'stu-202',
      firstName: 'Brian',
      lastName: 'Larsen',
      fullName: 'Brian Larsen',
      email: 'brian.l@email.com',
    },
  ],
};

// ─── Per-Operator Enrollments ───────────────────────────────────────────────

export const MOCK_ENROLLMENTS_BY_OPERATOR: Record<number, Record<string, FspEnrollment[]>> = {
  1001: MOCK_ENROLLMENTS,
  1002: {
    'stu-101': [
      {
        id: 'enr-101',
        studentId: 'stu-101',
        courseId: 'crs-ppl',
        courseName: 'Private Pilot License',
        status: 'active',
      },
    ],
    'stu-102': [
      {
        id: 'enr-102',
        studentId: 'stu-102',
        courseId: 'crs-ppl',
        courseName: 'Private Pilot License',
        status: 'active',
      },
    ],
  },
  1003: {
    'stu-201': [
      {
        id: 'enr-201',
        studentId: 'stu-201',
        courseId: 'crs-ppl',
        courseName: 'Private Pilot License',
        status: 'active',
      },
    ],
  },
};

// ─── Per-Operator Availability ──────────────────────────────────────────────

export const MOCK_AVAILABILITY_BY_OPERATOR: Record<number, Record<string, FspAvailability>> = {
  1001: MOCK_AVAILABILITY,
  1002: {
    'inst-101': {
      userGuidId: 'inst-101',
      availabilities: weekdayAvail(7, 16),
      availabilityOverrides: [],
    },
    'inst-102': {
      userGuidId: 'inst-102',
      availabilities: weekdayAvail(8, 18),
      availabilityOverrides: [],
    },
    'stu-101': {
      userGuidId: 'stu-101',
      availabilities: weekdayAvail(9, 17),
      availabilityOverrides: [],
    },
    'stu-102': {
      userGuidId: 'stu-102',
      availabilities: weekdayAvail(8, 15),
      availabilityOverrides: [],
    },
    'stu-103': {
      userGuidId: 'stu-103',
      availabilities: weekdayAvail(10, 18),
      availabilityOverrides: [],
    },
  },
  1003: {
    'inst-201': {
      userGuidId: 'inst-201',
      availabilities: weekdayAvail(7, 17),
      availabilityOverrides: [],
    },
    'stu-201': {
      userGuidId: 'stu-201',
      availabilities: weekdayAvail(8, 16),
      availabilityOverrides: [],
    },
    'stu-202': {
      userGuidId: 'stu-202',
      availabilities: weekdayAvail(9, 17),
      availabilityOverrides: [],
    },
  },
};

// ─── Operator Lookup Helpers ────────────────────────────────────────────────

/** Extract operatorId from a URL path like /operators/1001/... */
export function extractOperatorId(path: string): number {
  const match = path.match(/operators\/(\d+)/);
  return match ? parseInt(match[1]!, 10) : MOCK_OPERATOR_ID;
}

/** Track the last login email for session-aware mock routing. */
let _lastLoginEmail = '';
export function setLastLoginEmail(email: string) {
  _lastLoginEmail = email;
}
export function getLastLoginEmail(): string {
  return _lastLoginEmail;
}

/** Get the operator for a login email (returns first operator for that user). */
export function getOperatorForEmail(email: string): FspOperator {
  const entry = MOCK_LOGIN_BY_EMAIL[email];
  if (!entry) return MOCK_OPERATOR;
  return MOCK_ALL_OPERATORS.find((o) => o.id === entry.operatorId) ?? MOCK_OPERATOR;
}

export function getLocationsForOperator(opId: number): FspLocation[] {
  return MOCK_LOCATIONS_BY_OPERATOR[opId] ?? MOCK_LOCATIONS;
}
export function getAircraftForOperator(opId: number): FspAircraft[] {
  return MOCK_AIRCRAFT_BY_OPERATOR[opId] ?? MOCK_AIRCRAFT;
}
export function getInstructorsForOperator(opId: number): FspInstructor[] {
  return MOCK_INSTRUCTORS_BY_OPERATOR[opId] ?? MOCK_INSTRUCTORS;
}
export function getStudentsForOperator(opId: number): FspStudent[] {
  return MOCK_STUDENTS_BY_OPERATOR[opId] ?? MOCK_STUDENTS;
}
export function getUsersForOperator(opId: number): FspUser[] {
  return MOCK_USERS_BY_OPERATOR[opId] ?? MOCK_USERS;
}
export function getAvailabilityForOperator(opId: number): Record<string, FspAvailability> {
  return MOCK_AVAILABILITY_BY_OPERATOR[opId] ?? MOCK_AVAILABILITY;
}
export function getEnrollmentsForOperator(opId: number): Record<string, FspEnrollment[]> {
  return MOCK_ENROLLMENTS_BY_OPERATOR[opId] ?? MOCK_ENROLLMENTS;
}
