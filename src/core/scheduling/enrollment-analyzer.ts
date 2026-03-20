/**
 * T089 + T092: Enrollment analyzer for next-lesson scheduling.
 *
 * Analyzes enrollment progress and schedulable events to determine
 * the next required training event for a student. Also detects
 * newly completed lessons and fully completed enrollments by
 * comparing previous and current progress snapshots.
 */

import type {
  FspEnrollmentProgress,
  FspEnrollmentLesson,
  FspSchedulableEvent,
} from '../../api/fsp/fsp.types.js';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface NextRequiredEvent {
  studentId: string;
  studentName: string;
  enrollmentId: string;
  courseId: string;
  courseName: string;
  lessonId: string;
  lessonName: string;
  lessonOrder: number;
  activityTypeId: string;
  instructorIds: string[];
  aircraftIds: string[];
  schedulingGroupIds: string[];
  durationTotal: number;
  instructorDurationTotal: number;
  instructorRequired: boolean;
  flightType: number;
  routeType: number;
  timeOfDay: number;
}

export interface CompletedLessonInfo {
  studentId: string;
  enrollmentId: string;
  completedLessonId: string;
}

export interface CompletedEnrollmentInfo {
  studentId: string;
  enrollmentId: string;
}

export interface CompletionDetectionResult {
  /** Lessons that were not completed in the previous snapshot but are now. */
  newlyCompletedLessons: CompletedLessonInfo[];
  /** Enrollments where all lessons are now completed. */
  fullyCompletedEnrollments: CompletedEnrollmentInfo[];
}

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Analyzes enrollment progress and schedulable events to determine
 * the next required training event for a student.
 *
 * Logic:
 * 1. Get the list of lessons from the enrollment progress
 * 2. Find the first lesson (by order) that is NOT completed
 * 3. Cross-reference with schedulableEvents by lessonId
 * 4. Return the schedulable event details for that lesson
 * 5. Return null if all lessons are completed or no matching event found
 */
export function determineNextEvent(
  progress: FspEnrollmentProgress,
  schedulableEvents: FspSchedulableEvent[],
): NextRequiredEvent | null {
  // If enrollment is fully completed, no next event needed
  if (isEnrollmentComplete(progress)) {
    return null;
  }

  // Sort lessons by order to ensure we pick the correct next one
  const sortedLessons = [...progress.lessons].sort((a, b) => a.order - b.order);

  // Find the first uncompleted lesson
  const nextLesson = sortedLessons.find((lesson: FspEnrollmentLesson) => !lesson.isCompleted);

  if (!nextLesson) {
    // All lessons appear completed (but completedLessons < totalLessons).
    // This can happen with data inconsistencies — treat as complete.
    return null;
  }

  // Find the matching schedulable event for this lesson.
  // The schedulable event must match both the enrollmentId and lessonId
  // to ensure we get the right student's event entry.
  const matchingEvent = schedulableEvents.find(
    (event) =>
      event.enrollmentId === progress.enrollmentId && event.lessonId === nextLesson.lessonId,
  );

  if (!matchingEvent) {
    // No schedulable event exists for this lesson yet.
    // This could mean prerequisites aren't met, or the FSP
    // schedulable events list hasn't been refreshed.
    return null;
  }

  return {
    studentId: matchingEvent.studentId,
    studentName: `${matchingEvent.studentFirstName} ${matchingEvent.studentLastName}`,
    enrollmentId: matchingEvent.enrollmentId,
    courseId: matchingEvent.courseId,
    courseName: matchingEvent.courseName,
    lessonId: matchingEvent.lessonId,
    lessonName: matchingEvent.lessonName,
    lessonOrder: matchingEvent.lessonOrder,
    activityTypeId: matchingEvent.activityTypeId,
    instructorIds: matchingEvent.instructorIds,
    aircraftIds: matchingEvent.aircraftIds,
    schedulingGroupIds: matchingEvent.schedulingGroupIds,
    durationTotal: matchingEvent.durationTotal,
    instructorDurationTotal: matchingEvent.instructorDurationTotal,
    instructorRequired: matchingEvent.instructorRequired,
    flightType: matchingEvent.flightType,
    routeType: matchingEvent.routeType,
    timeOfDay: matchingEvent.timeOfDay,
  };
}

/**
 * Checks if an enrollment is fully completed (all lessons done).
 */
export function isEnrollmentComplete(progress: FspEnrollmentProgress): boolean {
  return progress.completedLessons >= progress.totalLessons;
}

/**
 * Calculate the progress percentage for an enrollment.
 *
 * @returns A number between 0 and 100 representing completion percentage.
 */
export function getProgressPercentage(progress: FspEnrollmentProgress): number {
  if (progress.totalLessons === 0) return 100;
  return Math.round((progress.completedLessons / progress.totalLessons) * 100);
}

// ─── T092: Completion Detection ─────────────────────────────────────────────

/**
 * Given a list of enrollment progress records, identify students
 * whose enrollments are fully complete and should NOT receive
 * next-lesson suggestions.
 *
 * Also identify students who have recently completed a lesson
 * (by comparing with a previous snapshot) — these are candidates
 * for next-lesson suggestion generation.
 *
 * @param previousProgress Map of enrollmentId -> FspEnrollmentProgress from last check.
 * @param currentProgress  Map of enrollmentId -> FspEnrollmentProgress from current check.
 * @returns Newly completed lessons and fully completed enrollments.
 */
export function detectCompletedLessons(
  previousProgress: Map<string, FspEnrollmentProgress>,
  currentProgress: Map<string, FspEnrollmentProgress>,
): CompletionDetectionResult {
  const newlyCompletedLessons: CompletedLessonInfo[] = [];
  const fullyCompletedEnrollments: CompletedEnrollmentInfo[] = [];

  for (const [enrollmentId, current] of currentProgress) {
    const previous = previousProgress.get(enrollmentId);

    // Check if enrollment is now fully completed
    if (isEnrollmentComplete(current)) {
      // Only report as newly fully completed if it wasn't complete before
      if (!previous || !isEnrollmentComplete(previous)) {
        fullyCompletedEnrollments.push({
          studentId: getStudentIdFromProgress(current),
          enrollmentId,
        });
      }
      // Fully completed enrollments don't need next-lesson suggestions
      continue;
    }

    // Compare lesson-level completion to detect newly completed lessons
    if (previous) {
      const previousLessonMap = new Map<string, boolean>(
        previous.lessons.map((l) => [l.lessonId, l.isCompleted]),
      );

      for (const lesson of current.lessons) {
        const wasPreviouslyCompleted = previousLessonMap.get(lesson.lessonId) ?? false;

        if (lesson.isCompleted && !wasPreviouslyCompleted) {
          newlyCompletedLessons.push({
            studentId: getStudentIdFromProgress(current),
            enrollmentId,
            completedLessonId: lesson.lessonId,
          });
        }
      }
    } else {
      // No previous snapshot — this enrollment is newly tracked.
      // Any completed lessons are treated as newly completed since
      // we don't know if we've processed them before. However, we
      // only care about the fact that this student may need their
      // NEXT lesson scheduled, so we skip individual lesson detection
      // here and let the pending-lesson detector handle it.
    }
  }

  return {
    newlyCompletedLessons,
    fullyCompletedEnrollments,
  };
}

/**
 * Extract a studentId from enrollment progress.
 *
 * The FspEnrollmentProgress type doesn't carry studentId directly,
 * so we derive it from the lessons (via schedulable events) or
 * return the enrollmentId as a fallback identifier.
 *
 * In practice, the caller should maintain a mapping of enrollmentId -> studentId.
 * This helper exists for the detection result structure.
 */
function getStudentIdFromProgress(progress: FspEnrollmentProgress): string {
  // FspEnrollmentProgress only has enrollmentId, completedLessons, totalLessons, and lessons.
  // The studentId must be resolved by the caller from the enrollment list.
  // We return the enrollmentId as a placeholder — the caller will resolve it.
  return progress.enrollmentId;
}
