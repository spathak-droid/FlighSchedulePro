import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the database and external modules
// ---------------------------------------------------------------------------

const mockDbGroupBy = vi.fn().mockResolvedValue([]);
// Queue of results for mockDbSelectWhere - consumed in order.
// Each result is returned as a thenable that also has .groupBy().
const selectWhereResults: unknown[][] = [];

const mockDbSelectWhere = vi.fn().mockImplementation(() => {
  const data = selectWhereResults.length > 0 ? selectWhereResults.shift()! : [];
  // Create a thenable that also supports .groupBy() and .orderBy()
  const thenable: any = {
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(data).then(resolve, reject),
    catch: (reject: (e: unknown) => void) => Promise.resolve(data).catch(reject),
    groupBy: () => {
      const groupData = selectWhereResults.length > 0 ? selectWhereResults.shift()! : [];
      return Promise.resolve(groupData);
    },
    orderBy: () => {
      // orderBy uses the data already consumed by .where()
      const orderResult: any = Promise.resolve(data);
      orderResult.limit = () => Promise.resolve(data);
      return orderResult;
    },
  };
  return thenable;
});
const mockDbSelectFrom = vi
  .fn()
  .mockReturnValue({ where: mockDbSelectWhere, orderBy: vi.fn().mockResolvedValue([]) });
const mockDbSelect = vi.fn().mockReturnValue({ from: mockDbSelectFrom });

const mockDbInsertReturning = vi.fn().mockResolvedValue([]);
const mockDbInsertValues = vi.fn().mockReturnValue({ returning: mockDbInsertReturning });
const mockDbInsert = vi.fn().mockReturnValue({ values: mockDbInsertValues });

const mockDbUpdateReturning = vi.fn().mockResolvedValue([]);
const mockDbUpdateWhere = vi.fn().mockReturnValue({ returning: mockDbUpdateReturning });
const mockDbUpdateSet = vi.fn().mockReturnValue({ where: mockDbUpdateWhere });
const mockDbUpdate = vi.fn().mockReturnValue({ set: mockDbUpdateSet });

vi.mock('../../../../../src/db/index.js', () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

vi.mock('../../../../../src/db/schema/index.js', () => ({
  disruptionEvents: {
    id: 'id',
    operatorId: 'operatorId',
    type: 'type',
    title: 'title',
    locationId: 'locationId',
    isActive: 'isActive',
    affectedAircraftIds: 'affectedAircraftIds',
    metadata: 'metadata',
    detectedAt: 'detectedAt',
  },
  reservationHistory: {
    id: 'id',
    operatorId: 'operatorId',
    locationId: 'locationId',
    studentId: 'studentId',
    aircraftId: 'aircraftId',
    instructorId: 'instructorId',
    startTime: 'startTime',
    status: 'status',
  },
  aircraft: {
    id: 'id',
    operatorId: 'operatorId',
    isActive: 'isActive',
    registration: 'registration',
    makeModel: 'makeModel',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
  ne: vi.fn(),
  sql: vi.fn(),
  inArray: vi.fn(),
}));

const mockGetLocations = vi.fn().mockReturnValue([]);

vi.mock('../../../../../src/api/fsp/mock/mock-data.js', () => ({
  getLocationsForOperator: (...args: unknown[]) => mockGetLocations(...args),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { DisruptionDetectorService } from '../../../../../src/api/modules/disruptions/disruption-detector.service.js';
import type { WeatherService } from '../../../../../src/api/modules/weather/weather.service.js';
import type { FspResourceService } from '../../../../../src/api/fsp/fsp-resource.service.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function createMockWeatherService(): WeatherService {
  return {
    fetchCurrentWeather: vi.fn().mockResolvedValue({
      flightCategory: 'VFR',
      visibility: 10,
      cloudCover: 20,
      windSpeed: 10,
      windGust: 15,
      temperature: 20,
    }),
  } as unknown as WeatherService;
}

function createMockFspResourceService(): FspResourceService {
  return {
    getAircraftTimes: vi.fn().mockResolvedValue({ totalHobbs: 450 }),
    getMaintenanceReminders: vi.fn().mockResolvedValue([]),
    getAvailability: vi.fn().mockResolvedValue([]),
  } as unknown as FspResourceService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DisruptionDetectorService', () => {
  let service: DisruptionDetectorService;
  let weatherService: WeatherService;
  let fspResourceService: FspResourceService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the result queue
    selectWhereResults.length = 0;

    weatherService = createMockWeatherService();
    fspResourceService = createMockFspResourceService();

    service = new DisruptionDetectorService(weatherService, fspResourceService);
  });

  // ─── Weather Disruptions ──────────────────────────────────────────────

  describe('detectWeatherDisruptions', () => {
    it('returns empty array when there are no locations', async () => {
      mockGetLocations.mockReturnValue([]);

      const result = await service.detectWeatherDisruptions(1, 'token');
      expect(result).toEqual([]);
    });

    it('skips locations without latitude/longitude', async () => {
      mockGetLocations.mockReturnValue([
        { id: 'loc-1', name: 'Airport', code: 'KABC', latitude: null, longitude: null },
      ]);

      const result = await service.detectWeatherDisruptions(1, 'token');
      expect(result).toEqual([]);
      expect(weatherService.fetchCurrentWeather).not.toHaveBeenCalled();
    });

    it('creates a critical disruption for IFR conditions', async () => {
      mockGetLocations.mockReturnValue([
        { id: 'loc-1', name: 'Airport', code: 'KABC', latitude: 40.0, longitude: -75.0 },
      ]);

      vi.mocked(weatherService.fetchCurrentWeather).mockResolvedValue({
        flightCategory: 'IFR',
        visibility: 2,
        cloudCover: 90,
        windSpeed: 20,
        windGust: 30,
        temperature: 15,
      } as any);

      // Upcoming reservations at this location
      selectWhereResults.push([
        { id: 'res-1', studentId: 'student-1', aircraftId: 'ac-1' },
        { id: 'res-2', studentId: 'student-2', aircraftId: 'ac-2' },
      ]);

      const result = await service.detectWeatherDisruptions(1, 'token');

      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe('weather');
      expect(result[0]!.severity).toBe('critical');
      expect(result[0]!.title).toContain('IFR');
      expect(result[0]!.title).toContain('KABC');
      expect(result[0]!.affectedReservationIds).toEqual(['res-1', 'res-2']);
      expect(result[0]!.affectedStudentIds).toContain('student-1');
      expect(result[0]!.isActive).toBe(true);
    });

    it('creates a grounded disruption for LIFR conditions', async () => {
      mockGetLocations.mockReturnValue([
        { id: 'loc-1', name: 'Airport', code: 'KABC', latitude: 40.0, longitude: -75.0 },
      ]);

      vi.mocked(weatherService.fetchCurrentWeather).mockResolvedValue({
        flightCategory: 'LIFR',
        visibility: 0.5,
        cloudCover: 100,
        windSpeed: 30,
        windGust: 45,
        temperature: 10,
      } as any);

      selectWhereResults.push([]);

      const result = await service.detectWeatherDisruptions(1, 'token');

      expect(result).toHaveLength(1);
      expect(result[0]!.severity).toBe('grounded');
    });

    it('does not create disruption for VFR conditions', async () => {
      mockGetLocations.mockReturnValue([
        { id: 'loc-1', name: 'Airport', code: 'KABC', latitude: 40.0, longitude: -75.0 },
      ]);

      vi.mocked(weatherService.fetchCurrentWeather).mockResolvedValue({
        flightCategory: 'VFR',
        visibility: 10,
        cloudCover: 20,
        windSpeed: 10,
        windGust: 15,
        temperature: 20,
      } as any);

      const result = await service.detectWeatherDisruptions(1, 'token');
      expect(result).toHaveLength(0);
    });

    it('does not create disruption for MVFR conditions', async () => {
      mockGetLocations.mockReturnValue([
        { id: 'loc-1', name: 'Airport', code: 'KABC', latitude: 40.0, longitude: -75.0 },
      ]);

      vi.mocked(weatherService.fetchCurrentWeather).mockResolvedValue({
        flightCategory: 'MVFR',
        visibility: 4,
        cloudCover: 60,
        windSpeed: 15,
        windGust: 20,
        temperature: 18,
      } as any);

      const result = await service.detectWeatherDisruptions(1, 'token');
      expect(result).toHaveLength(0);
    });

    it('handles weather API errors gracefully', async () => {
      mockGetLocations.mockReturnValue([
        { id: 'loc-1', name: 'Airport', code: 'KABC', latitude: 40.0, longitude: -75.0 },
      ]);

      vi.mocked(weatherService.fetchCurrentWeather).mockRejectedValue(new Error('API timeout'));

      const result = await service.detectWeatherDisruptions(1, 'token');
      expect(result).toEqual([]);
    });

    it('checks multiple locations independently', async () => {
      mockGetLocations.mockReturnValue([
        { id: 'loc-1', name: 'Airport A', code: 'KAAA', latitude: 40.0, longitude: -75.0 },
        { id: 'loc-2', name: 'Airport B', code: 'KBBB', latitude: 41.0, longitude: -76.0 },
      ]);

      // First location: IFR
      vi.mocked(weatherService.fetchCurrentWeather)
        .mockResolvedValueOnce({
          flightCategory: 'IFR',
          visibility: 2,
          cloudCover: 90,
          windSpeed: 20,
          windGust: 30,
          temperature: 15,
        } as any)
        // Second location: VFR (no disruption)
        .mockResolvedValueOnce({
          flightCategory: 'VFR',
          visibility: 10,
          cloudCover: 10,
          windSpeed: 5,
          windGust: 8,
          temperature: 22,
        } as any);

      // Reservations for first location
      selectWhereResults.push([]);

      const result = await service.detectWeatherDisruptions(1, 'token');

      expect(result).toHaveLength(1);
      expect(result[0]!.title).toContain('KAAA');
    });

    it('includes weather metadata in disruption event', async () => {
      mockGetLocations.mockReturnValue([
        { id: 'loc-1', name: 'Airport', code: 'KABC', latitude: 40.0, longitude: -75.0 },
      ]);

      vi.mocked(weatherService.fetchCurrentWeather).mockResolvedValue({
        flightCategory: 'IFR',
        visibility: 2.5,
        cloudCover: 85,
        windSpeed: 22,
        windGust: 35,
        temperature: 12,
      } as any);

      selectWhereResults.push([]);

      const result = await service.detectWeatherDisruptions(1, 'token');

      const meta = result[0]!.metadata;
      expect(meta.flightCategory).toBe('IFR');
      expect(meta.visibility).toBe(2.5);
      expect(meta.cloudCover).toBe(85);
      expect(meta.windSpeed).toBe(22);
      expect(meta.windGust).toBe(35);
      expect(meta.temperature).toBe(12);
      expect(meta.locationCode).toBe('KABC');
    });

    it('deduplicates affected student IDs', async () => {
      mockGetLocations.mockReturnValue([
        { id: 'loc-1', name: 'Airport', code: 'KABC', latitude: 40.0, longitude: -75.0 },
      ]);

      vi.mocked(weatherService.fetchCurrentWeather).mockResolvedValue({
        flightCategory: 'IFR',
        visibility: 2,
        cloudCover: 90,
        windSpeed: 20,
        windGust: 30,
        temperature: 15,
      } as any);

      // Same student has multiple reservations
      selectWhereResults.push([
        { id: 'res-1', studentId: 'student-1', aircraftId: 'ac-1' },
        { id: 'res-2', studentId: 'student-1', aircraftId: 'ac-2' },
        { id: 'res-3', studentId: 'student-2', aircraftId: 'ac-1' },
      ]);

      const result = await service.detectWeatherDisruptions(1, 'token');

      expect(result[0]!.affectedStudentIds).toHaveLength(2);
      expect(result[0]!.affectedStudentIds).toContain('student-1');
      expect(result[0]!.affectedStudentIds).toContain('student-2');
    });
  });

  // ─── Maintenance Disruptions ──────────────────────────────────────────

  describe('detectMaintenanceDisruptions', () => {
    it('returns empty array when there are no active aircraft', async () => {
      selectWhereResults.push([]); // No aircraft

      const result = await service.detectMaintenanceDisruptions(1);
      expect(result).toEqual([]);
    });

    it('creates a warning disruption when aircraft has < 50h remaining', async () => {
      // Active aircraft
      selectWhereResults.push([
        {
          id: 'ac-1',
          registration: 'N12345',
          makeModel: 'Cessna 172',
          isActive: true,
          operatorId: 1,
        },
      ]);

      // Maintenance data: 460h hobbs, next inspection at 500h = 40h remaining
      vi.mocked(fspResourceService.getAircraftTimes).mockResolvedValue({ totalHobbs: 460 } as any);
      vi.mocked(fspResourceService.getMaintenanceReminders).mockResolvedValue([]);

      // Upcoming reservations
      selectWhereResults.push([{ id: 'res-1', studentId: 'student-1' }]);

      const result = await service.detectMaintenanceDisruptions(1);

      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe('maintenance');
      expect(result[0]!.severity).toBe('warning');
      expect(result[0]!.title).toContain('N12345');
      expect(result[0]!.title).toContain('100-hr');
      expect(result[0]!.affectedAircraftIds).toEqual(['ac-1']);
    });

    it('creates a critical disruption when aircraft has < 20h remaining', async () => {
      selectWhereResults.push([
        {
          id: 'ac-1',
          registration: 'N12345',
          makeModel: 'Cessna 172',
          isActive: true,
          operatorId: 1,
        },
      ]);

      // 490h hobbs, next inspection at 500h = 10h remaining
      vi.mocked(fspResourceService.getAircraftTimes).mockResolvedValue({ totalHobbs: 490 } as any);
      vi.mocked(fspResourceService.getMaintenanceReminders).mockResolvedValue([]);

      selectWhereResults.push([]);

      const result = await service.detectMaintenanceDisruptions(1);

      expect(result).toHaveLength(1);
      expect(result[0]!.severity).toBe('critical');
    });

    it('does not create disruption when aircraft has >= 50h remaining', async () => {
      selectWhereResults.push([
        {
          id: 'ac-1',
          registration: 'N12345',
          makeModel: 'Cessna 172',
          isActive: true,
          operatorId: 1,
        },
      ]);

      // 350h hobbs, next inspection at 400h = 50h remaining
      vi.mocked(fspResourceService.getAircraftTimes).mockResolvedValue({ totalHobbs: 350 } as any);
      vi.mocked(fspResourceService.getMaintenanceReminders).mockResolvedValue([]);

      const result = await service.detectMaintenanceDisruptions(1);
      expect(result).toHaveLength(0);
    });

    it('skips aircraft when maintenance data fetch fails', async () => {
      selectWhereResults.push([
        {
          id: 'ac-1',
          registration: 'N12345',
          makeModel: 'Cessna 172',
          isActive: true,
          operatorId: 1,
        },
        {
          id: 'ac-2',
          registration: 'N67890',
          makeModel: 'Piper PA-28',
          isActive: true,
          operatorId: 1,
        },
      ]);

      // First aircraft fails
      vi.mocked(fspResourceService.getAircraftTimes)
        .mockRejectedValueOnce(new Error('API error'))
        // Second aircraft succeeds with low hours (no disruption needed)
        .mockResolvedValueOnce({ totalHobbs: 150 } as any);

      vi.mocked(fspResourceService.getMaintenanceReminders).mockResolvedValueOnce([]);

      const result = await service.detectMaintenanceDisruptions(1);
      expect(result).toHaveLength(0);
    });

    it('includes remaining hours in metadata', async () => {
      selectWhereResults.push([
        {
          id: 'ac-1',
          registration: 'N12345',
          makeModel: 'Cessna 172',
          isActive: true,
          operatorId: 1,
        },
      ]);

      vi.mocked(fspResourceService.getAircraftTimes).mockResolvedValue({ totalHobbs: 475 } as any);
      vi.mocked(fspResourceService.getMaintenanceReminders).mockResolvedValue([]);

      selectWhereResults.push([]);

      const result = await service.detectMaintenanceDisruptions(1);

      expect(result[0]!.metadata.remainingHours).toBe(25);
      expect(result[0]!.metadata.currentHobbs).toBe(475);
      expect(result[0]!.metadata.inspectionDue).toBe(500);
    });

    it('uses 100-hr reminder from maintenance reminders if available', async () => {
      selectWhereResults.push([
        {
          id: 'ac-1',
          registration: 'N12345',
          makeModel: 'Cessna 172',
          isActive: true,
          operatorId: 1,
        },
      ]);

      vi.mocked(fspResourceService.getAircraftTimes).mockResolvedValue({ totalHobbs: 470 } as any);
      vi.mocked(fspResourceService.getMaintenanceReminders).mockResolvedValue([
        { name: '100 Hour Inspection', dueHobbs: 480 },
      ]);

      selectWhereResults.push([]);

      const result = await service.detectMaintenanceDisruptions(1);

      expect(result).toHaveLength(1);
      // 480 - 470 = 10h remaining -> critical
      expect(result[0]!.severity).toBe('critical');
      expect(result[0]!.metadata.remainingHours).toBe(10);
    });
  });

  // ─── Instructor Disruptions ───────────────────────────────────────────

  describe('detectInstructorDisruptions', () => {
    it('returns empty array when no instructors have overloaded schedules', async () => {
      // Today's reservations: 5 flights for one instructor (below threshold of > 6)
      selectWhereResults.push(
        Array.from({ length: 5 }, (_, i) => ({
          id: `res-${i}`,
          instructorId: 'inst-1',
          studentId: `student-${i}`,
          aircraftId: 'ac-1',
        })),
      );

      // Weekly query: .where() consumes this, .groupBy() consumes next
      selectWhereResults.push([]);
      selectWhereResults.push([]);

      const result = await service.detectInstructorDisruptions(1);

      // 5 flights is <= 6, so no overload disruption
      // No weekly utilization issues either
      expect(result.filter((d) => d.title.includes('overloaded'))).toHaveLength(0);
    });

    it('creates disruption when instructor has > 6 flights in a day', async () => {
      // 7 flights for one instructor
      selectWhereResults.push(
        Array.from({ length: 8 }, (_, i) => ({
          id: `res-${i}`,
          instructorId: 'inst-1',
          studentId: `student-${i}`,
          aircraftId: `ac-${i % 2}`,
        })),
      );

      // Weekly query: .where() consumes this, .groupBy() consumes next
      selectWhereResults.push([]);
      selectWhereResults.push([]);

      const result = await service.detectInstructorDisruptions(1);

      const overloaded = result.filter((d) => d.title.includes('overloaded'));
      expect(overloaded).toHaveLength(1);
      expect(overloaded[0]!.type).toBe('instructor');
      expect(overloaded[0]!.severity).toBe('warning');
      expect(overloaded[0]!.title).toContain('inst-1');
      expect(overloaded[0]!.title).toContain('8 flights');
      expect(overloaded[0]!.affectedReservationIds).toHaveLength(8);
    });

    it('skips reservations without instructorId', async () => {
      // Mix of reservations with and without instructors
      selectWhereResults.push([
        { id: 'res-1', instructorId: null, studentId: 's1', aircraftId: 'ac-1' },
        { id: 'res-2', instructorId: 'inst-1', studentId: 's2', aircraftId: 'ac-1' },
      ]);

      // Weekly query: .where() consumes this, .groupBy() consumes next
      selectWhereResults.push([]);
      selectWhereResults.push([]);

      const result = await service.detectInstructorDisruptions(1);

      // inst-1 has only 1 flight, well under threshold
      expect(result.filter((d) => d.title.includes('overloaded'))).toHaveLength(0);
    });

    it('creates utilization disruption when instructor is above 75%', async () => {
      // Today's reservations (none overloaded daily)
      selectWhereResults.push([]);
      // Weekly .where() call (consumed by thenable, not used since .groupBy() follows)
      selectWhereResults.push([]);
      // Weekly .groupBy() result: 35 flights out of 40 max = 87.5%
      selectWhereResults.push([{ instructorId: 'inst-1', count: 35 }]);

      const result = await service.detectInstructorDisruptions(1);

      const utilization = result.filter((d) => d.title.includes('utilization'));
      expect(utilization).toHaveLength(1);
      expect(utilization[0]!.type).toBe('instructor');
      expect(utilization[0]!.severity).toBe('warning');
      expect(utilization[0]!.title).toContain('88%'); // Math.round(87.5)
    });

    it('does not create utilization disruption when below 75%', async () => {
      selectWhereResults.push([]);
      // Weekly .where() call (consumed by thenable)
      selectWhereResults.push([]);
      // Weekly .groupBy() result: 25 flights out of 40 = 62.5%
      selectWhereResults.push([{ instructorId: 'inst-1', count: 25 }]);

      const result = await service.detectInstructorDisruptions(1);

      const utilization = result.filter((d) => d.title.includes('utilization'));
      expect(utilization).toHaveLength(0);
    });

    it('handles both daily overload and weekly utilization simultaneously', async () => {
      // 8 flights today for inst-1
      selectWhereResults.push(
        Array.from({ length: 8 }, (_, i) => ({
          id: `res-${i}`,
          instructorId: 'inst-1',
          studentId: `student-${i}`,
          aircraftId: 'ac-1',
        })),
      );
      // Weekly .where() call (consumed by thenable)
      selectWhereResults.push([]);
      // Weekly .groupBy() result: 35/40 weekly for inst-2
      selectWhereResults.push([{ instructorId: 'inst-2', count: 35 }]);

      const result = await service.detectInstructorDisruptions(1);

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.some((d) => d.title.includes('overloaded'))).toBe(true);
      expect(result.some((d) => d.title.includes('utilization'))).toBe(true);
    });

    it('deduplicates affected student IDs in daily overload', async () => {
      // Same student with multiple flights under same instructor
      selectWhereResults.push([
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `res-${i}`,
          instructorId: 'inst-1',
          studentId: 'student-1', // Same student
          aircraftId: 'ac-1',
        })),
        ...Array.from({ length: 3 }, (_, i) => ({
          id: `res-${i + 5}`,
          instructorId: 'inst-1',
          studentId: 'student-2',
          aircraftId: 'ac-1',
        })),
      ]);

      // Weekly query: .where() consumes this, .groupBy() consumes next
      selectWhereResults.push([]);
      selectWhereResults.push([]);

      const result = await service.detectInstructorDisruptions(1);

      const overloaded = result.filter((d) => d.title.includes('overloaded'));
      expect(overloaded).toHaveLength(1);
      // Should deduplicate student IDs
      expect(overloaded[0]!.affectedStudentIds).toHaveLength(2);
    });
  });

  // ─── runAllChecks ─────────────────────────────────────────────────────

  describe('runAllChecks', () => {
    it('calls all three detectors in parallel', async () => {
      // Weather: no locations
      mockGetLocations.mockReturnValue([]);
      // Queries in order:
      // 1. maintenance: aircraft query
      // 2. instructor: today reservations
      // 3. instructor: weekly .where() (consumed by thenable)
      // 4. instructor: weekly .groupBy() result
      // 5. runAllChecks: existing active disruptions (.where + .orderBy)
      // 6. runAllChecks: getActiveDisruptions (.where + .orderBy)
      selectWhereResults.push([], [], [], [], [], []);

      const detectWeatherSpy = vi.spyOn(service, 'detectWeatherDisruptions');
      const detectMaintenanceSpy = vi.spyOn(service, 'detectMaintenanceDisruptions');
      const detectInstructorSpy = vi.spyOn(service, 'detectInstructorDisruptions');

      await service.runAllChecks(1, 'token');

      expect(detectWeatherSpy).toHaveBeenCalledWith(1, 'token');
      expect(detectMaintenanceSpy).toHaveBeenCalledWith(1);
      expect(detectInstructorSpy).toHaveBeenCalledWith(1);
    });

    it('returns categorized results', async () => {
      mockGetLocations.mockReturnValue([]);
      // Push enough empty results for all queries (same as above)
      selectWhereResults.push([], [], [], [], [], []);

      const result = await service.runAllChecks(1, 'token');

      expect(result).toHaveProperty('weather');
      expect(result).toHaveProperty('maintenance');
      expect(result).toHaveProperty('instructor');
      expect(Array.isArray(result.weather)).toBe(true);
      expect(Array.isArray(result.maintenance)).toBe(true);
      expect(Array.isArray(result.instructor)).toBe(true);
    });
  });
});
