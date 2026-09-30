import type { Action, AuthUser } from '@cctv/shared';
import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Every route must carry exactly one of these; the global AuthGuard denies
 * routes that have none (fail closed).
 */
export const PUBLIC_KEY = 'auth:public';
export const AUTHENTICATED_KEY = 'auth:authenticated';
export const PERMISSION_KEY = 'auth:permission';

/** No login required (health, login, logout). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Any signed-in user, regardless of role (me, change password). */
export const Authenticated = () => SetMetadata(AUTHENTICATED_KEY, true);

/** Signed-in user whose role grants `action` (see ROLE_PERMISSIONS). */
export const RequirePermission = (action: Action) =>
  SetMetadata(PERMISSION_KEY, action);

export interface AuthedRequest extends Request {
  user?: AuthUser;
  sessionId?: string;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => {
    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user) throw new Error('CurrentUser used on a route without auth');
    return user;
  },
);

export const CurrentSession = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const id = ctx.switchToHttp().getRequest<AuthedRequest>().sessionId;
    if (!id) throw new Error('CurrentSession used on a route without auth');
    return id;
  },
);
