import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock database (vi.hoisted avoids "Cannot access before initialization") ─

const { mockWhere, selectResults } = vi.hoisted(() => {
  const selectResults = { value: [] as unknown[][] };

  const mockWhere = vi.fn().mockImplementation(() => {
    const data = selectResults.value.shift() ?? [];
    // Each chain method just passes through the same data
    const chain: Record<string, unknown> = {
      then: (resolve: (v: unknown) => void) => Promise.resolve(data).then(resolve),
      catch: (fn: (e: unknown) => unknown) => Promise.resolve(data).catch(fn),
    };
    chain.orderBy = () => chain;
    chain.limit = () => Promise.resolve(data);
    return chain;
  });

  return { mockWhere, selectResults };
});

vi.mock('../../../../../src/db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: mockWhere,
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock('../../../../../src/db/schema/students.js', () => ({
  students: { operatorId: 'operator_id', id: 'id', firstName: 'first_name', lastName: 'last_name', totalFlightHours: 'total_flight_hours' },
}));

vi.mock('../../../../../src/db/schema/instructors.js', () => ({
  instructors: { operatorId: 'operator_id', id: 'id', firstName: 'first_name', lastName: 'last_name', isActive: 'is_active' },
}));

vi.mock('../../../../../src/db/schema/reservation-history.js', () => ({
  reservationHistory: { operatorId: 'operator_id', studentId: 'student_id', instructorId: 'instructor_id', status: 'status', startTime: 'start_time', endTime: 'end_time' },
}));

vi.mock('../../../../../src/db/schema/student-insights.js', () => ({
  studentInsights: { operatorId: 'operator_id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  gte: vi.fn((...args: unknown[]) => args),
  lt: vi.fn((...args: unknown[]) => args),
  lte: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((col: unknown) => col),
  sql: Object.assign((strings: TemplateStringsArray) => strings.join(''), {
    raw: (s: string) => s,
  }),
}));

import { StudentInsightsService } from '../../../../../src/api/modules/insights/student-insights.service.js';

describe('StudentInsightsService', () => {
  let service: StudentInsightsService;

  beforeEach(() => {
    service = new StudentInsightsService();
    vi.clearAllMocks();
  });

  describe('getCheckrideReadyStudents', () => {
    it('returns students with >= 90% enrollment completion', async () => {
      selectResults.value = [
        [
          { id: 'stu-003', firstName: 'Charlie', lastName: 'Brown', operatorId: 1001, totalFlightHours: '180' },
          { id: 'stu-001', firstName: 'Alice', lastName: 'Smith', operatorId: 1001, totalFlightHours: '50' },
        ],
      ];

      const result = await service.getCheckrideReadyStudents(1001);

      // stu-003 has 38/40 = 95% (checkride ready via MOCK_ENROLLMENT_DATA)
      // stu-001 has 16/40 = 40% (not ready)
      expect(result).toHaveLength(1);
      expect(result[0]!.studentId).toBe('stu-003');
      expect(result[0]!.enrollmentProgress).toBe(95);
      expect(result[0]!.completedLessons).toBe(38);
      expect(result[0]!.totalLessons).toBe(40);
    });

    it('returns empty when no students meet threshold', async () => {
      selectResults.value = [
        [
          { id: 'stu-005', firstName: 'Eve', lastName: 'Davis', operatorId: 1001, totalFlightHours: '10' },
        ],
      ];

      const result = await service.getCheckrideReadyStudents(1001);
      // stu-005 has 3/40 = 7.5%
      expect(result).toHaveLength(0);
    });

    it('skips students without enrollment data', async () => {
      selectResults.value = [
        [
          { id: 'unknown-student', firstName: 'Unknown', lastName: 'Pilot', operatorId: 1001, totalFlightHours: '0' },
        ],
      ];

      const result = await service.getCheckrideReadyStudents(1001);
      expect(result).toHaveLength(0);
    });
  });

  describe('getInactiveStudents', () => {
    it('identifies students with no recent flights and no upcoming reservations', async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      selectResults.value = [
        // All students for operator
        [{ id: 'stu-001', firstName: 'Alice', lastName: 'Smith', operatorId: 1001, totalFlightHours: '50' }],
        // Last flight for stu-001 (30 days ago) - from .orderBy().limit()
        [{ endTime: thirtyDaysAgo }],
        // Upcoming reservations count (0)
        [{ count: 0 }],
      ];

      const result = await service.getInactiveStudents(1001);
      expect(result).toHaveLength(1);
      expect(result[0]!.studentId).toBe('stu-001');
      expect(result[0]!.daysSinceLastFlight).toBeGreaterThanOrEqual(29);
    });

    it('excludes students with upcoming reservations', async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      selectResults.value = [
        [{ id: 'stu-001', firstName: 'Alice', lastName: 'Smith', operatorId: 1001, totalFlightHours: '50' }],
        [{ endTime: thirtyDaysAgo }],
        [{ count: 1 }], // Has upcoming reservation
      ];

      const result = await service.getInactiveStudents(1001);
      expect(result).toHaveLength(0);
    });

    it('returns 999 days for students who never flew', async () => {
      selectResults.value = [
        [{ id: 'stu-001', firstName: 'Alice', lastName: 'Smith', operatorId: 1001, totalFlightHours: '0' }],
        [], // No flights at all — lastFlight undefined
        [{ count: 0 }],
      ];

      const result = await service.getInactiveStudents(1001);
      expect(result).toHaveLength(1);
      expect(result[0]!.daysSinceLastFlight).toBe(999);
      expect(result[0]!.lastFlightDate).toBeNull();
    });
  });

  describe('getAtRiskStudents', () => {
    it('detects students with strictly increasing flight gaps', async () => {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;

      selectResults.value = [
        // All students
        [{ id: 'stu-001', firstName: 'Alice', lastName: 'Smith', operatorId: 1001, totalFlightHours: '30' }],
        // Flights in chronological order with increasing gaps: 3d, 5d, 8d
        [
          { startTime: new Date(now - 30 * day), endTime: new Date(now - 30 * day + 3600000) },
          { startTime: new Date(now - 27 * day), endTime: new Date(now - 27 * day + 3600000) },
          { startTime: new Date(now - 22 * day), endTime: new Date(now - 22 * day + 3600000) },
          { startTime: new Date(now - 14 * day), endTime: new Date(now - 14 * day + 3600000) },
        ],
      ];

      const result = await service.getAtRiskStudents(1001);
      expect(result).toHaveLength(1);
      expect(result[0]!.riskReason).toContain('increasing');
    });

    it('skips students with fewer than 3 flights', async () => {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;

      selectResults.value = [
        [{ id: 'stu-001', firstName: 'A', lastName: 'B', operatorId: 1001, totalFlightHours: '5' }],
        // Only 2 flights
        [
          { startTime: new Date(now - 10 * day), endTime: new Date(now - 10 * day + 3600000) },
          { startTime: new Date(now - 5 * day), endTime: new Date(now - 5 * day + 3600000) },
        ],
      ];

      const result = await service.getAtRiskStudents(1001);
      expect(result).toHaveLength(0);
    });

    it('skips students with non-increasing gaps', async () => {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;

      selectResults.value = [
        [{ id: 'stu-001', firstName: 'A', lastName: 'B', operatorId: 1001, totalFlightHours: '40' }],
        // Gaps: 5d, 3d, 5d — not strictly increasing
        [
          { startTime: new Date(now - 20 * day), endTime: new Date(now - 20 * day + 3600000) },
          { startTime: new Date(now - 15 * day), endTime: new Date(now - 15 * day + 3600000) },
          { startTime: new Date(now - 12 * day), endTime: new Date(now - 12 * day + 3600000) },
          { startTime: new Date(now - 7 * day), endTime: new Date(now - 7 * day + 3600000) },
        ],
      ];

      const result = await service.getAtRiskStudents(1001);
      expect(result).toHaveLength(0);
    });
  });

  describe('getAllInsights', () => {
    it('returns combined insights object with all arrays', async () => {
      // Each sub-method queries db, so provide results for each
      selectResults.value = [
        [], // getInactiveStudents: all students (empty => no inactive)
        [], // getCheckrideReadyStudents: all students (empty => none ready)
        [], // getAtRiskStudents: all students (empty => none at risk)
        [], // getInstructorWorkload: all instructors (empty => no workload)
      ];

      const result = await service.getAllInsights(1001);

      expect(result).toHaveProperty('inactive');
      expect(result).toHaveProperty('checkrideReady');
      expect(result).toHaveProperty('atRisk');
      expect(result).toHaveProperty('instructorWorkload');
      expect(Array.isArray(result.inactive)).toBe(true);
      expect(Array.isArray(result.checkrideReady)).toBe(true);
      expect(Array.isArray(result.atRisk)).toBe(true);
      expect(Array.isArray(result.instructorWorkload)).toBe(true);
    });
  });
});
