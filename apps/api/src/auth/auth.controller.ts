import {
  changePasswordSchema,
  loginSchema,
  type AuthUser,
  type ChangePasswordInput,
  type LoginInput,
  type LoginResponse,
} from '@cctv/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SESSION_COOKIE, type AuthConfig } from '../config/auth-config.js';
import { AUTH_CONFIG } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import {
  Authenticated,
  CurrentUser,
  Public,
  type AuthedRequest,
} from './decorators.js';
import { LoginThrottle, PasswordChangeThrottle } from './throttle.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  /** HttpOnly so page scripts (and XSS) cannot read it; Strict blocks CSRF. */
  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'strict',
      path: '/api',
    };
  }

  @Public()
  @LoginThrottle()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const previous: unknown = req.cookies?.[SESSION_COOKIE];
    const { user, token, expiresAt } = await this.auth.login(body);
    // A successful login replaces whatever session this browser had before
    // (e.g. another person on a shared computer): revoke it server-side.
    if (typeof previous === 'string' && previous) {
      await this.auth.logout(previous);
    }
    res.cookie(SESSION_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: this.config.ttlSeconds * 1000,
    });
    return { user, expiresAt: expiresAt.toISOString() };
  }

  /** Idempotent: always clears the cookie, revokes the session if valid. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    await this.auth.logout(typeof token === 'string' ? token : undefined);
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  @Authenticated()
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  /** Revokes every session of the user, so the client must sign in again. */
  @Authenticated()
  @PasswordChangeThrottle()
  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema))
    body: ChangePasswordInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.changePassword(user, body);
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }
}
