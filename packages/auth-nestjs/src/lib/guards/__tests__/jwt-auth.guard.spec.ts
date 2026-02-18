import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../../decorators/public.decorator';
import { JwtAuthGuard } from '../jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access when @Public() decorator is present', () => {
    const getAllAndOverrideSpy = vi
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(true);

    const handler = vi.fn();
    const klass = vi.fn();

    const context = {
      getHandler: () => handler,
      getClass: () => klass,
    } as unknown as ExecutionContext;

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(getAllAndOverrideSpy).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      handler,
      klass,
    ]);
  });

  it('should delegate to passport when route is not public', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    const context = {
      getHandler: () => vi.fn(),
      getClass: () => vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Bearer token' },
        }),
        getResponse: () => ({}),
        getNext: () => vi.fn(),
      }),
      getType: () => 'http',
      getArgs: () => [],
      getArgByIndex: () => ({}),
      switchToRpc: () => ({}),
      switchToWs: () => ({}),
    } as unknown as ExecutionContext;

    // canActivate delegates to passport, which rejects because no JWT strategy is registered
    const activateResult = guard.canActivate(context);
    expect(activateResult).toBeInstanceOf(Promise);
    await expect(activateResult).rejects.toThrow(
      'Unknown authentication strategy "jwt"'
    );
  });
});
