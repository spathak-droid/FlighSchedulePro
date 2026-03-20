import { describe, it, expect } from 'vitest';
import {
  determineNextEvent,
  isEnrollmentComplete,
  getProgressPercentage,
  detectCompletedLessons,
} from '../../../../src/core/scheduling/enrollment-analyzer.js';
import type {
  FspEnrollmentProgress,
  FspSchedulableEvent,
  FspEnrollmentLesson,
} from '../../../../src/api/fsp/fsp.types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgress(overrides: Partial<FspEnrollmentProgress> = {}): FspEnrollmentProgress {
  return {
    enrollmentId: 'enr-1',
    completedLessons: 2,
    totalLessons: 5,
    lessons: [
      { lessonId: 'L1', lessonName: 'Lesson 1', order: 1, isCompleted: true },
      { lessonId: 'L2', lessonName: 'Lesson 2', order: 2, isCompleted: true },
      { lessonId: 'L3', lessonName: 'Lesson 3', order: 3, isCompleted: false },
      { lessonId: 'L4', lessonName: 'Lesson 4', order: 4, isCompleted: false },
      { lessonId: 'L5', lessonName: 'Lesson 5', order: 5, isCompleted: false },
    ],
    ...overrides,
  };
}

function makeSchedulableEvent(
  overrides: Partial<FspSchedulableEvent> = {},
): FspSchedulableEvent {
  return {
    eventId: 'evt-1',
    enrollmentId: 'enr-1',
    studentId: 'student-1',
    studentFirstName: 'John',
    studentLastName: 'Doe',
    courseId: 'course-1',
    courseName: 'Private Pilot',
    lessonId: 'L3',
    lessonName: 'Lesson 3',
    lessonOrder: 3,
    flightType: 0,
    routeType: 0,
    timeOfDay: 0,
    durationTotal: 120,
    aircraftDurationTotal: 90,
    instructorDurationPre: 15,
    instructorDurationPost: 15,
    instructorDurationTotal: 120,
    instructorRequired: true,
    instructorIds: ['inst-1'],
    aircraftIds: ['ac-1'],
    schedulingGroupIds: ['sg-1'],
    meetingRoomIds: [],
    isStageCheck: false,
    reservationTypeId: 'rt-1',
    activityTypeId: 'at-1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isEnrollmentComplete
// ---------------------------------------------------------------------------

describe('isEnrollmentComplete', () => {
  it('returns false when there are incomplete lessons', () => {
    const progress = makeProgress({ completedLessons: 2, totalLessons: 5 });
    expect(isEnrollmentComplete(progress)).toBe(false);
  });

  it('returns true when all lessons are completed', () => {
    const progress = makeProgress({ completedLessons: 5, totalLessons: 5 });
    expect(isEnrollmentComplete(progress)).toBe(true);
  });

  it('returns true when completedLessons exceeds totalLessons (data anomaly)', () => {
    const progress = makeProgress({ completedLessons: 6, totalLessons: 5 });
    expect(isEnrollmentComplete(progress)).toBe(true);
  });

  it('returns true when totalLessons is 0', () => {
    const progress = makeProgress({ completedLessons: 0, totalLessons: 0 });
    expect(isEnrollmentComplete(progress)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getProgressPercentage
// ---------------------------------------------------------------------------

describe('getProgressPercentage', () => {
  it('returns 0 for no completed lessons', () => {
    const progress = makeProgress({ completedLessons: 0, totalLessons: 5 });
    expect(getProgressPercentage(progress)).toBe(0);
  });

  it('returns 100 for fully completed enrollment', () => {
    const progress = makeProgress({ completedLessons: 5, totalLessons: 5 });
    expect(getProgressPercentage(progress)).toBe(100);
  });

  it('returns 100 when totalLessons is 0 (edge case)', () => {
    const progress = makeProgress({ completedLessons: 0, totalLessons: 0 });
    expect(getProgressPercentage(progress)).toBe(100);
  });

  it('rounds to nearest integer', () => {
    const progress = makeProgress({ completedLessons: 1, totalLessons: 3 });
    expect(getProgressPercentage(progress)).toBe(33); // 33.33... rounds to 33
  });

  it('returns 40 for 2/5 completed', () => {
    const progress = makeProgress({ completedLessons: 2, totalLessons: 5 });
    expect(getProgressPercentage(progress)).toBe(40);
  });

  it('returns 50 for 1/2 completed', () => {
    const progress = makeProgress({ completedLessons: 1, totalLessons: 2 });
    expect(getProgressPercentage(progress)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// determineNextEvent
// ---------------------------------------------------------------------------

describe('determineNextEvent', () => {
  it('returns null when enrollment is fully complete', () => {
    const progress = makeProgress({ completedLessons: 5, totalLessons: 5 });
    const events = [makeSchedulableEvent()];

    const result = determineNextEvent(progress, events);
    expect(result).toBeNull();
  });

  it('returns the first uncompleted lesson matching a schedulable event', () => {
    const progress = makeProgress();
    const events = [makeSchedulableEvent({ lessonId: 'L3', enrollmentId: 'enr-1' })];

    const result = determineNextEvent(progress, events);

    expect(result).not.toBeNull();
    expect(result!.lessonId).toBe('L3');
    expect(result!.studentId).toBe('student-1');
    expect(result!.studentName).toBe('John Doe');
    expect(result!.enrollmentId).toBe('enr-1');
    expect(result!.courseId).toBe('course-1');
    expect(result!.courseName).toBe('Private Pilot');
  });

  it('returns null when no matching schedulable event exists', () => {
    const progress = makeProgress();
    // Events for a different enrollment
    const events = [makeSchedulableEvent({ enrollmentId: 'enr-999', lessonId: 'L3' })];

    const result = determineNextEvent(progress, events);
    expect(result).toBeNull();
  });

  it('returns null when no matching lessonId exists in schedulable events', () => {
    const progress = makeProgress();
    // Event exists for the enrollment but not for the next lesson
    const events = [makeSchedulableEvent({ enrollmentId: 'enr-1', lessonId: 'L99' })];

    const result = determineNextEvent(progress, events);
    expect(result).toBeNull();
  });

  it('picks the correct lesson when lessons are out of order', () => {
    const lessons: FspEnrollmentLesson[] = [
      { lessonId: 'L5', lessonName: 'Lesson 5', order: 5, isCompleted: false },
      { lessonId: 'L1', lessonName: 'Lesson 1', order: 1, isCompleted: true },
      { lessonId: 'L3', lessonName: 'Lesson 3', order: 3, isCompleted: false },
      { lessonId: 'L2', lessonName: 'Lesson 2', order: 2, isCompleted: true },
      { lessonId: 'L4', lessonName: 'Lesson 4', order: 4, isCompleted: false },
    ];

    const progress = makeProgress({ lessons, completedLessons: 2, totalLessons: 5 });
    const events = [
      makeSchedulableEvent({ enrollmentId: 'enr-1', lessonId: 'L3' }),
      makeSchedulableEvent({ enrollmentId: 'enr-1', lessonId: 'L5' }),
    ];

    const result = determineNextEvent(progress, events);

    // Should pick L3 (order 3) as the first uncompleted
    expect(result).not.toBeNull();
    expect(result!.lessonId).toBe('L3');
  });

  it('returns null when all lessons appear completed despite completedLessons mismatch', () => {
    const lessons: FspEnrollmentLesson[] = [
      { lessonId: 'L1', lessonName: 'Lesson 1', order: 1, isCompleted: true },
      { lessonId: 'L2', lessonName: 'Lesson 2', order: 2, isCompleted: true },
    ];

    // completedLessons says 1 < totalLessons 5, but all lessons in array are complete
    const progress = makeProgress({
      lessons,
      completedLessons: 1,
      totalLessons: 5,
    });
    const events = [makeSchedulableEvent()];

    const result = determineNextEvent(progress, events);
    expect(result).toBeNull();
  });

  it('populates all required fields from the schedulable event', () => {
    const progress = makeProgress();
    const event = makeSchedulableEvent({
      enrollmentId: 'enr-1',
      lessonId: 'L3',
      instructorRequired: true,
      durationTotal: 90,
      instructorDurationTotal: 90,
      flightType: 1,
      routeType: 1,
      timeOfDay: 2,
      instructorIds: ['i1', 'i2'],
      aircraftIds: ['a1'],
      schedulingGroupIds: ['sg1', 'sg2'],
    });

    const result = determineNextEvent(progress, [event]);

    expect(result!.instructorRequired).toBe(true);
    expect(result!.durationTotal).toBe(90);
    expect(result!.instructorDurationTotal).toBe(90);
    expect(result!.flightType).toBe(1);
    expect(result!.routeType).toBe(1);
    expect(result!.timeOfDay).toBe(2);
    expect(result!.instructorIds).toEqual(['i1', 'i2']);
    expect(result!.aircraftIds).toEqual(['a1']);
    expect(result!.schedulingGroupIds).toEqual(['sg1', 'sg2']);
  });
});

// ---------------------------------------------------------------------------
// detectCompletedLessons
// ---------------------------------------------------------------------------

describe('detectCompletedLessons', () => {
  it('returns empty results when both maps are empty', () => {
    const result = detectCompletedLessons(new Map(), new Map());
    expect(result.newlyCompletedLessons).toEqual([]);
    expect(result.fullyCompletedEnrollments).toEqual([]);
  });

  it('detects a newly completed lesson', () => {
    const prev = new Map([
      [
        'enr-1',
        makeProgress({
          enrollmentId: 'enr-1',
          completedLessons: 2,
          totalLessons: 5,
          lessons: [
            { lessonId: 'L1', lessonName: 'L1', order: 1, isCompleted: true },
            { lessonId: 'L2', lessonName: 'L2', order: 2, isCompleted: true },
            { lessonId: 'L3', lessonName: 'L3', order: 3, isCompleted: false },
          ],
        }),
      ],
    ]);

    const curr = new Map([
      [
        'enr-1',
        makeProgress({
          enrollmentId: 'enr-1',
          completedLessons: 3,
          totalLessons: 5,
          lessons: [
            { lessonId: 'L1', lessonName: 'L1', order: 1, isCompleted: true },
            { lessonId: 'L2', lessonName: 'L2', order: 2, isCompleted: true },
            { lessonId: 'L3', lessonName: 'L3', order: 3, isCompleted: true },
          ],
        }),
      ],
    ]);

    const result = detectCompletedLessons(prev, curr);

    expect(result.newlyCompletedLessons).toHaveLength(1);
    expect(result.newlyCompletedLessons[0]!.completedLessonId).toBe('L3');
    expect(result.newlyCompletedLessons[0]!.enrollmentId).toBe('enr-1');
    expect(result.fullyCompletedEnrollments).toHaveLength(0);
  });

  it('detects a fully completed enrollment', () => {
    const prev = new Map([
      [
        'enr-1',
        makeProgress({
          enrollmentId: 'enr-1',
          completedLessons: 4,
          totalLessons: 5,
        }),
      ],
    ]);

    const curr = new Map([
      [
        'enr-1',
        makeProgress({
          enrollmentId: 'enr-1',
          completedLessons: 5,
          totalLessons: 5,
          lessons: [
            { lessonId: 'L1', lessonName: 'L1', order: 1, isCompleted: true },
            { lessonId: 'L2', lessonName: 'L2', order: 2, isCompleted: true },
            { lessonId: 'L3', lessonName: 'L3', order: 3, isCompleted: true },
            { lessonId: 'L4', lessonName: 'L4', order: 4, isCompleted: true },
            { lessonId: 'L5', lessonName: 'L5', order: 5, isCompleted: true },
          ],
        }),
      ],
    ]);

    const result = detectCompletedLessons(prev, curr);

    expect(result.fullyCompletedEnrollments).toHaveLength(1);
    expect(result.fullyCompletedEnrollments[0]!.enrollmentId).toBe('enr-1');
    // Should NOT appear in newlyCompletedLessons since enrollment is fully done
    expect(result.newlyCompletedLessons).toHaveLength(0);
  });

  it('does not re-report an already-completed enrollment', () => {
    const completeProgress = makeProgress({
      enrollmentId: 'enr-1',
      completedLessons: 5,
      totalLessons: 5,
      lessons: [
        { lessonId: 'L1', lessonName: 'L1', order: 1, isCompleted: true },
        { lessonId: 'L2', lessonName: 'L2', order: 2, isCompleted: true },
        { lessonId: 'L3', lessonName: 'L3', order: 3, isCompleted: true },
        { lessonId: 'L4', lessonName: 'L4', order: 4, isCompleted: true },
        { lessonId: 'L5', lessonName: 'L5', order: 5, isCompleted: true },
      ],
    });

    const prev = new Map([['enr-1', completeProgress]]);
    const curr = new Map([['enr-1', completeProgress]]);

    const result = detectCompletedLessons(prev, curr);

    expect(result.fullyCompletedEnrollments).toHaveLength(0);
    expect(result.newlyCompletedLessons).toHaveLength(0);
  });

  it('handles new enrollments that did not exist in previous snapshot', () => {
    const prev = new Map<string, FspEnrollmentProgress>();
    const curr = new Map([
      [
        'enr-new',
        makeProgress({
          enrollmentId: 'enr-new',
          completedLessons: 2,
          totalLessons: 5,
        }),
      ],
    ]);

    const result = detectCompletedLessons(prev, curr);

    // New enrollment is not reported as newly completed
    // (only tracked going forward)
    expect(result.newlyCompletedLessons).toHaveLength(0);
    expect(result.fullyCompletedEnrollments).toHaveLength(0);
  });

  it('handles new enrollment that is immediately fully complete', () => {
    const prev = new Map<string, FspEnrollmentProgress>();
    const curr = new Map([
      [
        'enr-new',
        makeProgress({
          enrollmentId: 'enr-new',
          completedLessons: 5,
          totalLessons: 5,
        }),
      ],
    ]);

    const result = detectCompletedLessons(prev, curr);

    // Should be reported as fully completed since it was not tracked before
    expect(result.fullyCompletedEnrollments).toHaveLength(1);
    expect(result.fullyCompletedEnrollments[0]!.enrollmentId).toBe('enr-new');
  });

  it('detects multiple lesson completions in the same enrollment', () => {
    const prev = new Map([
      [
        'enr-1',
        makeProgress({
          enrollmentId: 'enr-1',
          completedLessons: 1,
          totalLessons: 5,
          lessons: [
            { lessonId: 'L1', lessonName: 'L1', order: 1, isCompleted: true },
            { lessonId: 'L2', lessonName: 'L2', order: 2, isCompleted: false },
            { lessonId: 'L3', lessonName: 'L3', order: 3, isCompleted: false },
          ],
        }),
      ],
    ]);

    const curr = new Map([
      [
        'enr-1',
        makeProgress({
          enrollmentId: 'enr-1',
          completedLessons: 3,
          totalLessons: 5,
          lessons: [
            { lessonId: 'L1', lessonName: 'L1', order: 1, isCompleted: true },
            { lessonId: 'L2', lessonName: 'L2', order: 2, isCompleted: true },
            { lessonId: 'L3', lessonName: 'L3', order: 3, isCompleted: true },
          ],
        }),
      ],
    ]);

    const result = detectCompletedLessons(prev, curr);

    expect(result.newlyCompletedLessons).toHaveLength(2);
    const completedIds = result.newlyCompletedLessons.map((l) => l.completedLessonId).sort();
    expect(completedIds).toEqual(['L2', 'L3']);
  });

  it('handles multiple enrollments independently', () => {
    const prev = new Map([
      [
        'enr-1',
        makeProgress({
          enrollmentId: 'enr-1',
          completedLessons: 1,
          totalLessons: 2,
          lessons: [
            { lessonId: 'L1', lessonName: 'L1', order: 1, isCompleted: true },
            { lessonId: 'L2', lessonName: 'L2', order: 2, isCompleted: false },
          ],
        }),
      ],
      [
        'enr-2',
        makeProgress({
          enrollmentId: 'enr-2',
          completedLessons: 0,
          totalLessons: 3,
          lessons: [
            { lessonId: 'A1', lessonName: 'A1', order: 1, isCompleted: false },
          ],
        }),
      ],
    ]);

    const curr = new Map([
      [
        'enr-1',
        makeProgress({
          enrollmentId: 'enr-1',
          completedLessons: 2,
          totalLessons: 2,
          lessons: [
            { lessonId: 'L1', lessonName: 'L1', order: 1, isCompleted: true },
            { lessonId: 'L2', lessonName: 'L2', order: 2, isCompleted: true },
          ],
        }),
      ],
      [
        'enr-2',
        makeProgress({
          enrollmentId: 'enr-2',
          completedLessons: 1,
          totalLessons: 3,
          lessons: [
            { lessonId: 'A1', lessonName: 'A1', order: 1, isCompleted: true },
          ],
        }),
      ],
    ]);

    const result = detectCompletedLessons(prev, curr);

    // enr-1 is fully completed
    expect(result.fullyCompletedEnrollments).toHaveLength(1);
    expect(result.fullyCompletedEnrollments[0]!.enrollmentId).toBe('enr-1');

    // enr-2 has a newly completed lesson
    expect(result.newlyCompletedLessons).toHaveLength(1);
    expect(result.newlyCompletedLessons[0]!.enrollmentId).toBe('enr-2');
    expect(result.newlyCompletedLessons[0]!.completedLessonId).toBe('A1');
  });
});
