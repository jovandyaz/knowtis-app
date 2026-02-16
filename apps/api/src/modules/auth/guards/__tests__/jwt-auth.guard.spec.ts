import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IS_PUBLIC_KEY } from '../../decorators/public.decorator';
import { JwtAuthGuard } from '../jwt-auth.guard';

function createMockExecutionContext(
  overrides: Partial<ExecutionContext> = {}
): ExecutionContext {
  return {
    getHandler: vi.fn().mockReturnValue(() => {}),
    getClass: vi.fn().mockReturnValue(class {}),
    getArgs: vi.fn(),
    getArgByIndex: vi.fn(),
    switchToRpc: vi.fn(),
    switchToHttp: vi.fn(),
    switchToWs: vi.fn(),
    getType: vi.fn(),
    ...overrides,
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  describe('canActivate', () => {
    it('should return true for routes decorated with @Public()', () => {
      const context = createMockExecutionContext();

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    });

    it('should call super.canActivate for non-public routes', () => {
      const context = createMockExecutionContext();

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const superCanActivateSpy = vi
        .spyOn(AuthGuard('jwt').prototype, 'canActivate')
        .mockReturnValue(true);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(superCanActivateSpy).toHaveBeenCalledWith(context);

      superCanActivateSpy.mockRestore();
    });

    it('should call super.canActivate when IS_PUBLIC_KEY metadata is undefined', () => {
      const context = createMockExecutionContext();

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const superCanActivateSpy = vi
        .spyOn(AuthGuard('jwt').prototype, 'canActivate')
        .mockReturnValue(true);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(superCanActivateSpy).toHaveBeenCalledWith(context);

      superCanActivateSpy.mockRestore();
    });

    it('should return true for public routes regardless of auth state', () => {
      const context = createMockExecutionContext();

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      // super.canActivate should NOT be called for public routes
      const superCanActivateSpy = vi.spyOn(
        AuthGuard('jwt').prototype,
        'canActivate'
      );

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(superCanActivateSpy).not.toHaveBeenCalled();

      superCanActivateSpy.mockRestore();
    });

    it('should delegate to Passport for JWT validation on protected routes', () => {
      const context = createMockExecutionContext();

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const superCanActivateSpy = vi
        .spyOn(AuthGuard('jwt').prototype, 'canActivate')
        .mockReturnValue(false);

      const result = guard.canActivate(context);

      expect(result).toBe(false);
      expect(superCanActivateSpy).toHaveBeenCalledWith(context);

      superCanActivateSpy.mockRestore();
    });

    it('should check both handler and class for IS_PUBLIC_KEY metadata', () => {
      const handler = vi.fn();
      const cls = class TestController {};
      const context = createMockExecutionContext({
        getHandler: vi.fn().mockReturnValue(handler),
        getClass: vi.fn().mockReturnValue(cls),
      });

      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      guard.canActivate(context);

      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
        handler,
        cls,
      ]);
    });
  });
});
