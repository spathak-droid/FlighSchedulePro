import { Injectable, Logger } from '@nestjs/common';
import { FspClient } from './fsp.client.js';
import type {
  FspScheduleRequest,
  FspScheduleResponse,
  FspReservationListRequest,
  FspReservationListResponse,
  FspCreateReservationRequest,
  FspReservationResponse,
  FspReservationDetail,
} from './fsp.types.js';

@Injectable()
export class FspScheduleService {
  private readonly logger = new Logger(FspScheduleService.name);

  constructor(private readonly fspClient: FspClient) {}

  /**
   * Fetch the schedule view (events, resources, unavailability).
   *
   * Endpoint: POST /api/v2/schedule
   */
  async getSchedule(
    operatorId: number,
    token: string,
    params: FspScheduleRequest,
  ): Promise<FspScheduleResponse> {
    this.logger.debug(
      `Fetching schedule for operator ${operatorId}: ${params.start} – ${params.end}`,
    );

    return this.fspClient.apiPost<FspScheduleResponse>(
      operatorId,
      '/api/v2/schedule',
      token,
      params,
    );
  }

  /**
   * List reservations for an operator with filtering and pagination.
   *
   * Endpoint: POST /api/V1/operator/{operatorId}/operatorReservations/list
   */
  async getReservations(
    operatorId: number,
    token: string,
    params: FspReservationListRequest,
  ): Promise<FspReservationListResponse> {
    this.logger.debug(`Listing reservations for operator ${operatorId}`);

    return this.fspClient.apiPost<FspReservationListResponse>(
      operatorId,
      `/api/V1/operator/${operatorId}/operatorReservations/list`,
      token,
      params,
    );
  }

  /**
   * Create a reservation in FSP.
   *
   * IMPORTANT: Always call `validateReservation` first to check for conflicts
   * before calling this method (validate-then-create pattern).
   *
   * Endpoint: POST /api/V2/Reservation (validateOnly: false)
   *
   * @returns The created reservation ID on success, or errors on failure.
   */
  async createReservation(
    operatorId: number,
    token: string,
    params: Omit<FspCreateReservationRequest, 'validateOnly'>,
  ): Promise<FspReservationResponse> {
    this.logger.log(
      `Creating reservation for operator ${operatorId}: ` +
        `pilot=${params.pilotId}, aircraft=${params.aircraftId}, ` +
        `${params.start} – ${params.end}`,
    );

    const body: FspCreateReservationRequest = {
      ...params,
      validateOnly: false,
    };

    return this.fspClient.apiPost<FspReservationResponse>(
      operatorId,
      '/api/V2/Reservation',
      token,
      body,
    );
  }

  /**
   * Validate a reservation without creating it.
   *
   * Use this to check for scheduling conflicts, resource availability, and
   * other business-rule violations before presenting a suggestion to the
   * scheduler.
   *
   * Endpoint: POST /api/V2/Reservation (validateOnly: true)
   */
  async validateReservation(
    operatorId: number,
    token: string,
    params: Omit<FspCreateReservationRequest, 'validateOnly'>,
  ): Promise<FspReservationResponse> {
    this.logger.debug(
      `Validating reservation for operator ${operatorId}: ` +
        `pilot=${params.pilotId}, ${params.start} – ${params.end}`,
    );

    const body: FspCreateReservationRequest = {
      ...params,
      validateOnly: true,
    };

    return this.fspClient.apiPost<FspReservationResponse>(
      operatorId,
      '/api/V2/Reservation',
      token,
      body,
    );
  }

  /**
   * Delete (cancel) a reservation.
   *
   * Endpoint: DELETE /scheduling/v1.0/operators/{operatorId}/reservations/{reservationId}
   */
  async deleteReservation(operatorId: number, token: string, reservationId: string): Promise<void> {
    this.logger.log(`Deleting reservation ${reservationId} for operator ${operatorId}`);

    await this.fspClient.coreDelete<void>(
      operatorId,
      `/scheduling/v1.0/operators/${operatorId}/reservations/${reservationId}`,
      token,
    );
  }

  /**
   * Get full details for a single reservation.
   *
   * Endpoint: GET /api/V2/Reservation/{reservationId}
   *
   * NOTE: FSP requires the operatorId as a query parameter for this endpoint.
   */
  async getReservationDetail(
    operatorId: number,
    token: string,
    reservationId: string,
  ): Promise<FspReservationDetail> {
    this.logger.debug(`Fetching reservation detail ${reservationId} for operator ${operatorId}`);

    return this.fspClient.apiGet<FspReservationDetail>(
      operatorId,
      `/api/V2/Reservation/${reservationId}?operatorId=${operatorId}`,
      token,
    );
  }
}
