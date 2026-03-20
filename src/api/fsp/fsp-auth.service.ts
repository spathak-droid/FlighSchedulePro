import { Injectable, Logger } from '@nestjs/common';
import { FspClient } from './fsp.client.js';
import type {
  FspLoginRequest,
  FspLoginResponse,
  FspMfaRequest,
  FspMfaResponse,
  FspOperator,
  FspOperatorDetail,
  FspUserPermissions,
} from './fsp.types.js';

@Injectable()
export class FspAuthService {
  private readonly logger = new Logger(FspAuthService.name);

  constructor(private readonly fspClient: FspClient) {}

  /**
   * Authenticate with email + password.
   *
   * If the response contains `mfaRequired: true`, the caller must follow up
   * with `mfa()` using the returned `mfaToken`.
   *
   * Endpoint: POST /common/v1.0/sessions/credentials
   */
  async login(email: string, password: string): Promise<FspLoginResponse> {
    this.logger.log(`Authenticating user ${email}`);

    const body: FspLoginRequest = { email, password };
    return this.fspClient.authPost<FspLoginResponse>('/common/v1.0/sessions/credentials', body);
  }

  /**
   * Complete MFA verification.
   *
   * Endpoint: POST /common/v1.0/sessions/mfa
   *
   * @param mfaToken  The token returned by `login()` when MFA is required.
   * @param code      User-supplied MFA code.
   * @param method    1 = Authenticator, 2 = Email, 100 = Backup code.
   * @param rememberMe  Whether to persist the MFA approval.
   */
  async mfa(
    mfaToken: string,
    code: string,
    method: number,
    rememberMe = false,
  ): Promise<FspMfaResponse> {
    this.logger.log('Completing MFA verification');

    const body: FspMfaRequest = {
      mfaToken,
      mfaCode: code,
      mfaMethod: method,
      rememberMe,
    };
    return this.fspClient.authPost<FspMfaResponse>('/common/v1.0/sessions/mfa', body);
  }

  /**
   * Refresh an existing session token.
   *
   * Endpoint: POST /common/v1.0/sessions/refresh
   *
   * @param token  The current bearer token to refresh.
   */
  async refresh(token: string): Promise<FspLoginResponse> {
    this.logger.log('Refreshing session token');

    return this.fspClient.authPost<FspLoginResponse>(
      '/common/v1.0/sessions/refresh',
      undefined,
      token,
    );
  }

  /**
   * Terminate a session.
   *
   * Endpoint: DELETE /api/V1/sessions
   */
  async logout(token: string): Promise<void> {
    this.logger.log('Logging out session');

    await this.fspClient.authDelete<void>('/api/V1/sessions', token);
  }

  /**
   * List operators the authenticated user belongs to.
   *
   * Endpoint: GET /api/V1/myoperators
   */
  async getOperators(token: string): Promise<FspOperator[]> {
    this.logger.debug('Fetching operator list');

    return this.fspClient.authGet<FspOperator[]>('/api/V1/myoperators', token);
  }

  /**
   * Get detailed information about a single operator.
   *
   * Endpoint: GET /api/V1/myoperators/{operatorId}
   */
  async getOperatorDetail(token: string, operatorId: number): Promise<FspOperatorDetail> {
    this.logger.debug(`Fetching operator detail for ${operatorId}`);

    return this.fspClient.authGet<FspOperatorDetail>(`/api/V1/myoperators/${operatorId}`, token);
  }

  /**
   * Get permissions for a specific user within an operator.
   *
   * Endpoint: GET /core/v1.0/operators/{operatorId}/users/{userId}/permissions
   */
  async getUserPermissions(
    token: string,
    operatorId: number,
    userId: string,
  ): Promise<FspUserPermissions> {
    this.logger.debug(`Fetching permissions for user ${userId} in operator ${operatorId}`);

    return this.fspClient.coreGet<FspUserPermissions>(
      operatorId,
      `/core/v1.0/operators/${operatorId}/users/${userId}/permissions`,
      token,
    );
  }
}
