import { Injectable, Logger } from '@nestjs/common';
import { FspClient } from './fsp.client.js';
import type {
  FspSchedulableEventsRequest,
  FspSchedulableEvent,
  FspStudent,
  FspEnrollment,
  FspEnrollmentProgress,
} from './fsp.types.js';

@Injectable()
export class FspTrainingService {
  private readonly logger = new Logger(FspTrainingService.name);

  constructor(private readonly fspClient: FspClient) {}

  /**
   * Get schedulable training events (lessons ready to be scheduled).
   *
   * Endpoint: POST /traininghub/v1.0/operators/{operatorId}/schedulableEvents
   */
  async getSchedulableEvents(
    operatorId: number,
    token: string,
    request: FspSchedulableEventsRequest,
  ): Promise<FspSchedulableEvent[]> {
    this.logger.debug(
      `Fetching schedulable events for operator ${operatorId}, ` +
        `location ${request.locationId}: ${request.startDate} – ${request.endDate}`,
    );

    return this.fspClient.curriculumPost<FspSchedulableEvent[]>(
      operatorId,
      `/traininghub/v1.0/operators/${operatorId}/schedulableEvents`,
      token,
      request,
    );
  }

  /**
   * List all students for an operator.
   *
   * Endpoint: GET /traininghub/v1.0/operators/{operatorId}/students
   */
  async getStudents(operatorId: number, token: string): Promise<FspStudent[]> {
    this.logger.debug(`Fetching students for operator ${operatorId}`);

    return this.fspClient.curriculumGet<FspStudent[]>(
      operatorId,
      `/traininghub/v1.0/operators/${operatorId}/students`,
      token,
    );
  }

  /**
   * List enrollments for a specific student.
   *
   * Endpoint: GET /traininghub/v1.0/operators/{operatorId}/enrollments/list/{studentId}
   */
  async getEnrollments(
    operatorId: number,
    token: string,
    studentId: string,
  ): Promise<FspEnrollment[]> {
    this.logger.debug(
      `Fetching enrollments for student ${studentId} in operator ${operatorId}`,
    );

    return this.fspClient.curriculumGet<FspEnrollment[]>(
      operatorId,
      `/traininghub/v1.0/operators/${operatorId}/enrollments/list/${studentId}`,
      token,
    );
  }

  /**
   * Get lesson-level progress for an enrollment.
   *
   * Endpoint: GET /traininghub/v1.0/operators/{operatorId}/enrollments/{enrollmentId}/progress
   */
  async getEnrollmentProgress(
    operatorId: number,
    token: string,
    enrollmentId: string,
  ): Promise<FspEnrollmentProgress> {
    this.logger.debug(
      `Fetching enrollment progress for ${enrollmentId} in operator ${operatorId}`,
    );

    return this.fspClient.curriculumGet<FspEnrollmentProgress>(
      operatorId,
      `/traininghub/v1.0/operators/${operatorId}/enrollments/${enrollmentId}/progress`,
      token,
    );
  }
}
