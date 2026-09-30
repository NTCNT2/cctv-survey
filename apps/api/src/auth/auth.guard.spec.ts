import { can, type AuthUser } from '@cctv/shared';
import {
  Controller,
  ForbiddenException,
  Get,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard.js';
import type { AuthService, Session } from './auth.service.js';
import { Authenticated, Public, RequirePermission } from './decorators.js';

@Controller()
class Fixture {
  @Public() @Get() open() {}
  @Authenticated() @Get() anyUser() {}
  @RequirePermission('project:write') @Get() write() {}
  @Get() undecorated() {}
}

function ctx(handler: keyof Fixture, cookies?: Record<string, string>) {
  const req: Record<string, unknown> = { cookies };
  const context = {
    getHandler: () => Fixture.prototype[handler],
    getClass: () => Fixture,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { context, req };
}

function guardFor(session: Session | undefined) {
  const authenticate = vi.fn().mockResolvedValue(session);
  const guard = new AuthGuard(new Reflector(), {
    authenticate,
  } as unknown as AuthService);
  return { guard, authenticate };
}

const user = (role: AuthUser['role']): Session => ({
  sessionId: 's1',
  user: { id: 'u1', username: 'u', role },
});
const cookie = { cctv_session: 'token' };

describe('AuthGuard', () => {
  it('lets @Public() routes through without touching the session', async () => {
    const { guard, authenticate } = guardFor(undefined);
    await expect(guard.canActivate(ctx('open').context)).resolves.toBe(true);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('401 without a cookie or with an invalid session', async () => {
    await expect(
      guardFor(user('admin')).guard.canActivate(ctx('anyUser').context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guardFor(undefined).guard.canActivate(ctx('anyUser', cookie).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the user and allows @Authenticated() for every role', async () => {
    for (const role of ['viewer', 'surveyor', 'admin'] as const) {
      const { context, req } = ctx('anyUser', cookie);
      await expect(
        guardFor(user(role)).guard.canActivate(context),
      ).resolves.toBe(true);
      expect(req.user).toEqual(user(role).user);
      expect(req.sessionId).toBe('s1');
    }
  });

  it('enforces @RequirePermission() with the shared permission table', async () => {
    for (const role of ['viewer', 'surveyor', 'admin'] as const) {
      const run = guardFor(user(role)).guard.canActivate(
        ctx('write', cookie).context,
      );
      if (can(role, 'project:write')) await expect(run).resolves.toBe(true);
      else await expect(run).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('fails closed (403) for a route with no access rule', async () => {
    await expect(
      guardFor(user('admin')).guard.canActivate(
        ctx('undecorated', cookie).context,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
