import {
  Controller,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  UnprocessableEntityException,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { loginSchema, mfaSchema } from './dto/login.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { ZodError } from 'zod';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/auth/login
   * Authenticate with email/password. Returns JWT or MFA challenge.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: this.formatZodErrors(parsed.error),
        error: 'Validation failed',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }

    return this.authService.login(parsed.data.email, parsed.data.password);
  }

  /**
   * POST /api/v1/auth/mfa
   * Complete MFA verification and receive JWT.
   */
  @Public()
  @Post('mfa')
  @HttpCode(HttpStatus.OK)
  async mfa(@Body() body: unknown) {
    const parsed = mfaSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        message: this.formatZodErrors(parsed.error),
        error: 'Validation failed',
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      });
    }

    return this.authService.mfa(parsed.data.mfaToken, parsed.data.mfaCode, parsed.data.mfaMethod);
  }

  /**
   * POST /api/v1/auth/refresh
   * Refresh an existing JWT (requires valid auth).
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() request: { headers: Record<string, string | undefined> }) {
    const token = this.extractToken(request);
    return this.authService.refresh(token);
  }

  /**
   * DELETE /api/v1/auth/logout
   * Invalidate session (requires valid auth).
   */
  @Delete('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: { headers: Record<string, string | undefined> }) {
    const token = this.extractToken(request);
    await this.authService.logout(token);
  }

  private extractToken(request: { headers: Record<string, string | undefined> }): string {
    const authorization = request.headers.authorization ?? '';
    const [, token] = authorization.split(' ');
    return token ?? '';
  }

  private formatZodErrors(error: ZodError): string[] {
    return error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
  }
}
