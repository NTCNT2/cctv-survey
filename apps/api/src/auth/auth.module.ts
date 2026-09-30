import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { loadAuthConfig } from '../config/auth-config.js';
import { AUTH_CONFIG } from './auth.constants.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { throttlers } from './throttle.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [
    // Secret and options are passed per call by TokenService.
    JwtModule.register({}),
    // Only applied on routes marked @LoginThrottle() / @PasswordChangeThrottle().
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => throttlers(loadAuthConfig(config)),
    }),
  ],
  controllers: [AuthController],
  providers: [
    // Validates JWT_SECRET / JWT_EXPIRES_IN at startup; the app will not boot
    // with a missing or placeholder secret.
    {
      provide: AUTH_CONFIG,
      inject: [ConfigService],
      useFactory: loadAuthConfig,
    },
    PasswordService,
    TokenService,
    AuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}
