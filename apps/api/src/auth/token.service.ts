import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  JWT_AUDIENCE,
  JWT_ISSUER,
  type AuthConfig,
} from '../config/auth-config.js';
import { AUTH_CONFIG } from './auth.constants.js';

export interface TokenClaims {
  /** User id. */
  sub: string;
  /** Session id (row in user_sessions). */
  jti: string;
}

/**
 * HS256 JWTs. Verification pins the algorithm, issuer and audience, so `alg:
 * none` and algorithm-confusion tokens are rejected.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  sign(claims: TokenClaims): Promise<string> {
    return this.jwt.signAsync(
      { sub: claims.sub },
      {
        secret: this.config.jwtSecret,
        algorithm: 'HS256',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        jwtid: claims.jti,
        expiresIn: this.config.ttlSeconds,
      },
    );
  }

  /** Returns undefined for any invalid token; the reason is deliberately dropped. */
  async verify(token: string): Promise<TokenClaims | undefined> {
    try {
      const payload = await this.jwt.verifyAsync<Record<string, unknown>>(
        token,
        {
          secret: this.config.jwtSecret,
          algorithms: ['HS256'],
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
      );
      const { sub, jti } = payload;
      return typeof sub === 'string' && typeof jti === 'string'
        ? { sub, jti }
        : undefined;
    } catch {
      return undefined;
    }
  }
}
