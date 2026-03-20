import { Injectable, Logger } from '@nestjs/common';
import { FspClient } from './fsp.client.js';
import type {
  FspAircraft,
  FspInstructor,
  FspLocation,
  FspActivityType,
  FspAvailabilityRequest,
  FspAvailability,
  FspCivilTwilight,
} from './fsp.types.js';

@Injectable()
export class FspResourceService {
  private readonly logger = new Logger(FspResourceService.name);

  constructor(private readonly fspClient: FspClient) {}

  /**
   * List all aircraft for an operator.
   *
   * Endpoint: GET /core/v1.0/operators/{operatorId}/aircraft
   */
  async getAircraft(operatorId: number, token: string): Promise<FspAircraft[]> {
    this.logger.debug(`Fetching aircraft for operator ${operatorId}`);

    return this.fspClient.coreGet<FspAircraft[]>(
      operatorId,
      `/core/v1.0/operators/${operatorId}/aircraft`,
      token,
    );
  }

  /**
   * List all instructors for an operator.
   *
   * Endpoint: GET /core/v1.0/operators/{operatorId}/instructors
   */
  async getInstructors(operatorId: number, token: string): Promise<FspInstructor[]> {
    this.logger.debug(`Fetching instructors for operator ${operatorId}`);

    return this.fspClient.coreGet<FspInstructor[]>(
      operatorId,
      `/core/v1.0/operators/${operatorId}/instructors`,
      token,
    );
  }

  /**
   * List all locations for an operator.
   *
   * Endpoint: GET /common/v1.0/operators/{operatorId}/locations
   */
  async getLocations(operatorId: number, token: string): Promise<FspLocation[]> {
    this.logger.debug(`Fetching locations for operator ${operatorId}`);

    return this.fspClient.coreGet<FspLocation[]>(
      operatorId,
      `/common/v1.0/operators/${operatorId}/locations`,
      token,
    );
  }

  /**
   * List all activity types for an operator.
   *
   * Endpoint: GET /api/v1/operator/{operatorId}/activitytypes
   */
  async getActivityTypes(operatorId: number, token: string): Promise<FspActivityType[]> {
    this.logger.debug(`Fetching activity types for operator ${operatorId}`);

    return this.fspClient.apiGet<FspActivityType[]>(
      operatorId,
      `/api/v1/operator/${operatorId}/activitytypes`,
      token,
    );
  }

  /**
   * Get availability and overrides for one or more users (instructors).
   *
   * Endpoint: POST /schedulinghub/v1.0/operators/{operatorId}/users/availabilityAndOverrides
   */
  async getAvailability(
    operatorId: number,
    token: string,
    request: FspAvailabilityRequest,
  ): Promise<FspAvailability[]> {
    this.logger.debug(
      `Fetching availability for operator ${operatorId}, users: ${request.userGuidIds.join(', ')}`,
    );

    return this.fspClient.corePost<FspAvailability[]>(
      operatorId,
      `/schedulinghub/v1.0/operators/${operatorId}/users/availabilityAndOverrides`,
      token,
      request,
    );
  }

  /**
   * Get aircraft hours/times (hobbs, tach, etc.).
   *
   * Endpoint: GET /core/v1.0/operators/{operatorId}/aircraft/{aircraftId}/times
   */
  async getAircraftTimes(operatorId: number, aircraftId: string, token: string): Promise<unknown> {
    this.logger.debug(`Fetching aircraft times for ${aircraftId}`);
    return this.fspClient.coreGet(
      operatorId,
      `/core/v1.0/operators/${operatorId}/aircraft/${aircraftId}/times`,
      token,
    );
  }

  /**
   * Get maintenance reminders for an aircraft.
   *
   * Endpoint: GET /core/v1.0/operators/{operatorId}/aircraft/{aircraftId}/maintenanceReminders
   */
  async getMaintenanceReminders(operatorId: number, aircraftId: string, token: string): Promise<unknown[]> {
    this.logger.debug(`Fetching maintenance reminders for ${aircraftId}`);
    return this.fspClient.coreGet(
      operatorId,
      `/core/v1.0/operators/${operatorId}/aircraft/${aircraftId}/maintenanceReminders`,
      token,
    );
  }

  /**
   * Get squawks (reported issues) for an aircraft.
   *
   * Endpoint: GET /core/v1.0/operators/{operatorId}/aircraft/{aircraftId}/squawks
   */
  async getSquawks(operatorId: number, aircraftId: string, token: string): Promise<unknown[]> {
    this.logger.debug(`Fetching squawks for ${aircraftId}`);
    return this.fspClient.coreGet(
      operatorId,
      `/core/v1.0/operators/${operatorId}/aircraft/${aircraftId}/squawks`,
      token,
    );
  }

  /**
   * Get civil twilight (dawn/dusk times) for a location.
   *
   * Endpoint: GET /common/v1.0/operators/{operatorId}/locations/{locationId}/civilTwilight
   */
  async getCivilTwilight(
    operatorId: number,
    token: string,
    locationId: string,
  ): Promise<FspCivilTwilight> {
    this.logger.debug(
      `Fetching civil twilight for operator ${operatorId}, location ${locationId}`,
    );

    return this.fspClient.coreGet<FspCivilTwilight>(
      operatorId,
      `/common/v1.0/operators/${operatorId}/locations/${locationId}/civilTwilight`,
      token,
    );
  }
}
