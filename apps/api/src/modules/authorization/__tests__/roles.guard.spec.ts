import type { UserRole } from '@jovandyaz/auth';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { Roles, RolesGuard } from '../roles.guard';

class NoRolesController {
  handler(): void {}
}

@Roles('admin')
class ClassRolesController {
  handler(): void {}
}

class HandlerRolesController {
  @Roles('admin')
  handler(): void {}
}

@Roles('admin')
class HandlerOverridesClassController {
  @Roles('user')
  handler(): void {}
}

class AnyOfRolesController {
  @Roles('admin', 'user')
  handler(): void {}
}

interface RequestUserStub {
  id: string;
  role?: UserRole;
}

const ADMIN: RequestUserStub = { id: '1', role: 'admin' };
const MEMBER: RequestUserStub = { id: '2', role: 'user' };
const ROLELESS: RequestUserStub = { id: '3' };

function createExecutionContext(
  target: new () => { handler(): void },
  user: RequestUserStub
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => target.prototype.handler,
    getClass: () => target,
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('allows access when neither handler nor class require a role', () => {
    const context = createExecutionContext(NoRolesController, ROLELESS);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('reads class-level roles and allows a user holding one', () => {
    const context = createExecutionContext(ClassRolesController, ADMIN);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('reads class-level roles and forbids a user without one', () => {
    const context = createExecutionContext(ClassRolesController, MEMBER);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('reads handler-level roles and allows a user holding one', () => {
    const context = createExecutionContext(HandlerRolesController, ADMIN);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('reads handler-level roles and forbids a user without one', () => {
    const context = createExecutionContext(HandlerRolesController, MEMBER);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('forbids a user with no role when a role is required', () => {
    const context = createExecutionContext(HandlerRolesController, ROLELESS);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('lets handler roles override the class roles', () => {
    const context = createExecutionContext(
      HandlerOverridesClassController,
      MEMBER
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('does not merge the class roles into the overriding handler roles', () => {
    const context = createExecutionContext(
      HandlerOverridesClassController,
      ADMIN
    );

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it.each([ADMIN, MEMBER])(
    'accepts any of the listed roles ($role)',
    (user) => {
      const context = createExecutionContext(AnyOfRolesController, user);

      expect(guard.canActivate(context)).toBe(true);
    }
  );
});
