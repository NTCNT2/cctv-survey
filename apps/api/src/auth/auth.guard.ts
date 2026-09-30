import { can, type Action } from '@cctv/shared';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SESSION_COOKIE } from '../config/auth-config.js';
import { AuthService } from './auth.service.js';
import {
  AUTHENTICATED_KEY,
  PERMISSION_KEY,
  PUBLIC_KEY,
  type AuthedRequest,
} from './decorators.js';

/**
 * Global guard (APP_GUARD). Default-deny: a route is reachable only if it is
 * marked @Public(), or the caller has a live session AND the route is marked
 * @Authenticated() or @RequirePermission() with an action the role grants.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    const session =
      typeof token === 'string' && token
        ? await this.auth.authenticate(token)
        : undefined;
    if (!session) throw new UnauthorizedException();
    req.user = session.user;
    req.sessionId = session.sessionId;

    const action = this.reflector.getAllAndOverride<Action | undefined>(
      PERMISSION_KEY,
      targets,
    );
    if (action) {
      if (can(session.user.role, action)) return true;
      throw new ForbiddenException('insufficient permissions');
    }
    if (this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_KEY, targets)) {
      return true;
    }
    // The route declares no access rule: fail closed.
    throw new ForbiddenException('insufficient permissions');
  }
}
