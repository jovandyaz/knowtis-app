import {
  IS_PUBLIC_KEY,
  JwtAuthGuard,
  RetryAfterHttpException,
} from '@jovandyaz/auth-nestjs';
import { AuthErrorCodes, AuthErrors, USER_ROLE } from '@jovandyaz/auth/server';
import type { AuthDomainError, RequestUser } from '@jovandyaz/auth/server';
import { ForbiddenException, HttpStatus } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { err, ok, type Result } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { UserScopedThrottlerGuard } from '../ai/guards/user-scoped-throttler.guard';
import { AuthAccountController } from './auth-account.controller';

const USER_ID = '00000000-0000-4000-8000-00000000ac01';
const FAMILY_ID = '00000000-0000-4000-8000-00000000ac02';
const CODE = '123456';

function makeCaller(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    id: USER_ID,
    email: 'verifier@test.local',
    name: 'Verifier',
    familyId: FAMILY_ID,
    role: USER_ROLE.USER,
    ...overrides,
  };
}

interface ThrownHttpError {
  getStatus(): number;
  getResponse(): unknown;
}

// `packages/auth-nestjs` resolves its own physical copy of `@nestjs/common`, so
// the HttpException it throws is a different class identity than this app's and
// `instanceof` is false here — the deployed bundle externalizes both to one copy.
function asHttpError(error: unknown): ThrownHttpError {
  const candidate = error as Partial<ThrownHttpError>;
  if (
    typeof candidate?.getStatus !== 'function' ||
    typeof candidate.getResponse !== 'function'
  ) {
    throw new Error(`Expected an HTTP exception, received: ${String(error)}`);
  }
  return candidate as ThrownHttpError;
}

function createController(
  result: Result<void, AuthDomainError> = ok(undefined)
) {
  const verifyEmailCodeHandler = { execute: vi.fn().mockResolvedValue(result) };
  const controller = new AuthAccountController(
    {} as never,
    {} as never,
    {} as never,
    verifyEmailCodeHandler as never,
    {} as never
  );

  return { controller, verifyEmailCodeHandler };
}

describe('AuthAccountController.verifyEmailCode', () => {
  it("passes the caller's own session family so verifying does not log it out", async () => {
    const { controller, verifyEmailCodeHandler } = createController();

    await controller.verifyEmailCode(makeCaller(), { code: CODE });

    expect(verifyEmailCodeHandler.execute).toHaveBeenCalledWith({
      userId: USER_ID,
      code: CODE,
      familyId: FAMILY_ID,
    });
  });

  it('confirms the verification to the caller', async () => {
    const { controller } = createController();

    await expect(
      controller.verifyEmailCode(makeCaller(), { code: CODE })
    ).resolves.toEqual({ message: 'Email verified successfully' });
  });

  it('answers 400 when the submitted code does not match', async () => {
    const { controller } = createController(
      err(AuthErrors.invalidVerificationCode())
    );

    const thrown = await controller
      .verifyEmailCode(makeCaller(), { code: CODE })
      .catch((error: unknown) => error);

    expect(asHttpError(thrown).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(asHttpError(thrown).getResponse()).toMatchObject({
      error: AuthErrorCodes.INVALID_VERIFICATION_CODE,
      code: AuthErrorCodes.INVALID_VERIFICATION_CODE,
    });
  });

  it('answers 429 once the attempt budget is spent', async () => {
    const { controller } = createController(
      err(AuthErrors.tooManyVerificationAttempts(31_000))
    );

    const thrown = await controller
      .verifyEmailCode(makeCaller(), { code: CODE })
      .catch((error: unknown) => error);

    expect(asHttpError(thrown).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(asHttpError(thrown).getResponse()).toMatchObject({
      error: AuthErrorCodes.TOO_MANY_VERIFICATION_ATTEMPTS,
      code: AuthErrorCodes.TOO_MANY_VERIFICATION_ATTEMPTS,
    });
  });

  it('hands the spent-budget 429 a Retry-After the filter can write', async () => {
    const { controller } = createController(
      err(AuthErrors.tooManyVerificationAttempts(31_000))
    );

    const thrown = await controller
      .verifyEmailCode(makeCaller(), { code: CODE })
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(RetryAfterHttpException);
    expect((thrown as RetryAfterHttpException).retryAfterSeconds).toBe(31);
  });

  it('is guarded by the controller-wide JWT guard', () => {
    // Absent metadata has to fail here rather than slip through as a vacuous pass.
    expect(Reflect.getMetadata(GUARDS_METADATA, AuthAccountController)).toEqual(
      [JwtAuthGuard]
    );
  });

  it('never opts out of that guard, unlike the link endpoint', () => {
    const { controller } = createController();

    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, controller.verifyEmailCode)
    ).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, controller.verifyEmail)).toBe(
      true
    );
  });
});

describe('AuthAccountController.resendVerification', () => {
  it('refuses a visitor who has no real address to send to', async () => {
    const resendVerificationHandler = { execute: vi.fn() };
    const controller = new AuthAccountController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      resendVerificationHandler as never
    );

    await expect(
      controller.resendVerification(makeCaller({ isAnonymous: true }))
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(resendVerificationHandler.execute).not.toHaveBeenCalled();
  });

  it('sends for a registered account', async () => {
    const resendVerificationHandler = {
      execute: vi.fn().mockResolvedValue(ok(undefined)),
    };
    const controller = new AuthAccountController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      resendVerificationHandler as never
    );

    await expect(controller.resendVerification(makeCaller())).resolves.toEqual({
      message: 'Verification email sent successfully',
    });
    expect(resendVerificationHandler.execute).toHaveBeenCalledWith({
      userId: USER_ID,
    });
  });
});

describe('AuthAccountController verification throttles', () => {
  it.each([
    ['verifyEmailCode', AuthAccountController.prototype.verifyEmailCode],
    ['resendVerification', AuthAccountController.prototype.resendVerification],
  ])(
    'keys the %s cap to the caller, not to a rotatable IP',
    (_name, handler) => {
      // `?? []` because `toContain` passes on an undefined subject in this vitest.
      const guards: unknown[] =
        Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];

      expect(guards).toContain(UserScopedThrottlerGuard);
    }
  );
});
