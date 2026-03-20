import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FspAuthService } from '../../fsp/fsp-auth.service.js';
import { OnboardingService } from './onboarding.service.js';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface.js';

export interface AuthTokenResponse {
  token: string;
  user: {
    userId: string;
    email: string;
    operatorId: number;
    permissions: string[];
  };
}

export interface LoginResponse {
  mfaRequired: boolean;
  mfaToken?: string;
  token?: string;
  user?: AuthTokenResponse['user'];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly fspAuthService: FspAuthService,
    private readonly onboardingService: OnboardingService,
  ) {}

  /**
   * Authenticate user via FSP credentials and issue a local JWT.
   * If FSP requires MFA, returns the MFA challenge instead of a token.
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    const fspResult = await this.fspAuthService.login(email, password);

    if (fspResult.mfaRequired) {
      return {
        mfaRequired: true,
        mfaToken: fspResult.mfaToken,
      };
    }

    const fspToken = fspResult.token;
    const fspUser = fspResult.user;

    // Get operator list for this user
    const operators = await this.fspAuthService.getOperators(fspToken);
    const operator = operators[0];
    if (!operator) {
      throw new UnauthorizedException('No operator access configured for this user');
    }

    // Get permissions for this user in the operator
    const permissionsResult = await this.fspAuthService.getUserPermissions(
      fspToken,
      operator.id,
      fspUser.id,
    );

    // Auto-onboard operator if this is their first login
    await this.onboardingService.onboardOperator(operator.id, operator.name);

    const tokenResponse = await this.issueToken({
      userId: fspUser.id,
      email: fspUser.email,
      operatorId: operator.id,
      permissions: permissionsResult.permissions,
    });

    return {
      mfaRequired: false,
      token: tokenResponse.token,
      user: tokenResponse.user,
    };
  }

  /**
   * Complete MFA verification and issue a JWT.
   */
  async mfa(mfaToken: string, code: string, method: number): Promise<AuthTokenResponse> {
    const fspResult = await this.fspAuthService.mfa(mfaToken, code, method);
    const fspToken = fspResult.token;

    // After MFA, we need to fetch user info and operators
    // The MFA response only gives us a token, so re-fetch via operators endpoint
    const operators = await this.fspAuthService.getOperators(fspToken);
    const operator = operators[0];
    if (!operator) {
      throw new UnauthorizedException('No operator access configured for this user');
    }

    const operatorDetail = await this.fspAuthService.getOperatorDetail(fspToken, operator.id);
    const permissionsResult = await this.fspAuthService.getUserPermissions(
      fspToken,
      operator.id,
      operatorDetail.userId,
    );

    await this.onboardingService.onboardOperator(operator.id, operator.name);

    return this.issueToken({
      userId: operatorDetail.userId,
      email: operatorDetail.email,
      operatorId: operator.id,
      permissions: permissionsResult.permissions,
    });
  }

  /**
   * Refresh an existing JWT -- validates current token and issues a new one.
   */
  async refresh(token: string): Promise<AuthTokenResponse> {
    const payload = await this.validateToken(token);

    return this.issueToken({
      userId: payload.sub,
      email: payload.email,
      operatorId: payload.operatorId,
      permissions: payload.permissions,
    });
  }

  /**
   * Logout -- best-effort FSP session cleanup.
   * JWT invalidation is handled client-side (short-lived tokens).
   */
  async logout(_token: string): Promise<void> {
    // FSP logout requires the FSP token, which we don't store.
    // In production, we'd maintain a mapping. For now, JWT expiry handles it.
    this.logger.debug('Logout processed — JWT will expire naturally');
  }

  /**
   * Verify JWT signature and expiry. Returns the decoded payload.
   */
  async validateToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /**
   * Issue a signed JWT with the standard payload shape.
   */
  private async issueToken(params: {
    userId: string;
    email: string;
    operatorId: number;
    permissions: string[];
  }): Promise<AuthTokenResponse> {
    const payload: JwtPayload = {
      sub: params.userId,
      email: params.email,
      operatorId: params.operatorId,
      permissions: params.permissions,
    };

    const token = await this.jwtService.signAsync(payload);

    return {
      token,
      user: {
        userId: params.userId,
        email: params.email,
        operatorId: params.operatorId,
        permissions: params.permissions,
      },
    };
  }
}
