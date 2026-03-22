import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../../../../src/api/modules/auth/auth.service.js';

// ─── Mocks ──────────────────────────────────────────────────────────────────

function createMockFspAuthService() {
  return {
    login: vi.fn(),
    mfa: vi.fn(),
    getOperators: vi.fn(),
    getOperatorDetail: vi.fn(),
    getUserPermissions: vi.fn(),
  };
}

function createMockJwtService() {
  return {
    signAsync: vi.fn().mockResolvedValue('jwt-token-123'),
    verifyAsync: vi.fn(),
  };
}

function createMockOnboardingService() {
  return {
    onboardOperator: vi.fn().mockResolvedValue(undefined),
  };
}

describe('AuthService', () => {
  let authService: AuthService;
  let mockFspAuth: ReturnType<typeof createMockFspAuthService>;
  let mockJwt: ReturnType<typeof createMockJwtService>;
  let mockOnboarding: ReturnType<typeof createMockOnboardingService>;

  beforeEach(() => {
    mockFspAuth = createMockFspAuthService();
    mockJwt = createMockJwtService();
    mockOnboarding = createMockOnboardingService();

    authService = new AuthService(
      mockJwt as any,
      mockFspAuth as any,
      mockOnboarding as any,
    );
  });

  // ── login ───────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns MFA challenge when FSP requires MFA', async () => {
      mockFspAuth.login.mockResolvedValue({
        mfaRequired: true,
        mfaToken: 'mfa-token-abc',
      });

      const result = await authService.login('user@test.com', 'password');

      expect(result.mfaRequired).toBe(true);
      expect(result.mfaToken).toBe('mfa-token-abc');
      expect(result.token).toBeUndefined();
    });

    it('issues JWT on successful login without MFA', async () => {
      mockFspAuth.login.mockResolvedValue({
        mfaRequired: false,
        token: 'fsp-token',
        user: { id: 'user-1', email: 'user@test.com' },
      });
      mockFspAuth.getOperators.mockResolvedValue([{ id: 1001, name: 'Test School' }]);
      mockFspAuth.getUserPermissions.mockResolvedValue({ permissions: ['read', 'write'] });

      const result = await authService.login('user@test.com', 'password');

      expect(result.mfaRequired).toBe(false);
      expect(result.token).toBe('jwt-token-123');
      expect(result.user?.operatorId).toBe(1001);
      expect(result.user?.permissions).toEqual(['read', 'write']);
    });

    it('throws UnauthorizedException when no operators found', async () => {
      mockFspAuth.login.mockResolvedValue({
        mfaRequired: false,
        token: 'fsp-token',
        user: { id: 'user-1', email: 'user@test.com' },
      });
      mockFspAuth.getOperators.mockResolvedValue([]);

      await expect(authService.login('user@test.com', 'password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('auto-onboards operator on first login', async () => {
      mockFspAuth.login.mockResolvedValue({
        mfaRequired: false,
        token: 'fsp-token',
        user: { id: 'user-1', email: 'user@test.com' },
      });
      mockFspAuth.getOperators.mockResolvedValue([{ id: 1001, name: 'Test School' }]);
      mockFspAuth.getUserPermissions.mockResolvedValue({ permissions: [] });

      await authService.login('user@test.com', 'password');

      expect(mockOnboarding.onboardOperator).toHaveBeenCalledWith(1001, 'Test School');
    });
  });

  // ── mfa ─────────────────────────────────────────────────────────────────

  describe('mfa', () => {
    it('completes MFA and issues JWT', async () => {
      mockFspAuth.mfa.mockResolvedValue({ token: 'fsp-token-after-mfa' });
      mockFspAuth.getOperators.mockResolvedValue([{ id: 1001, name: 'Test School' }]);
      mockFspAuth.getOperatorDetail.mockResolvedValue({
        userId: 'user-1',
        email: 'user@test.com',
      });
      mockFspAuth.getUserPermissions.mockResolvedValue({ permissions: ['admin'] });

      const result = await authService.mfa('mfa-token', '123456', 1);

      expect(result.token).toBe('jwt-token-123');
      expect(result.user.operatorId).toBe(1001);
      expect(result.user.permissions).toEqual(['admin']);
    });

    it('throws UnauthorizedException when no operators after MFA', async () => {
      mockFspAuth.mfa.mockResolvedValue({ token: 'fsp-token' });
      mockFspAuth.getOperators.mockResolvedValue([]);

      await expect(authService.mfa('mfa-token', '123456', 1)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── refresh ─────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('issues a new JWT from valid existing token', async () => {
      mockJwt.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        email: 'user@test.com',
        operatorId: 1001,
        permissions: ['read'],
      });

      const result = await authService.refresh('old-jwt');

      expect(result.token).toBe('jwt-token-123');
      expect(result.user.userId).toBe('user-1');
    });

    it('throws UnauthorizedException for invalid token', async () => {
      mockJwt.verifyAsync.mockRejectedValue(new Error('invalid'));

      await expect(authService.refresh('bad-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── validateToken ─────────────────────────────────────────────────────

  describe('validateToken', () => {
    it('returns decoded payload for valid token', async () => {
      const payload = { sub: 'user-1', email: 'a@b.com', operatorId: 1, permissions: [] };
      mockJwt.verifyAsync.mockResolvedValue(payload);

      const result = await authService.validateToken('valid-jwt');
      expect(result).toEqual(payload);
    });

    it('throws UnauthorizedException for expired token', async () => {
      mockJwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(authService.validateToken('expired-jwt')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── logout ──────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('completes without error', async () => {
      await expect(authService.logout('any-token')).resolves.toBeUndefined();
    });
  });
});
