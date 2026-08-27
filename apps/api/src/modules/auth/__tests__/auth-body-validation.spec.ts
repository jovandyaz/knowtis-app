import {
  PARAMTYPES_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { describe, expect, it } from 'vitest';

import { AuthAccountController } from '../auth-account.controller';
import { AuthSessionController } from '../auth-session.controller';
import {
  AnonymousSessionDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailCodeDto,
  VerifyEmailDto,
} from '../dto/auth.dto';

type Constructor = new (...args: never[]) => object;

interface BodyRoute {
  readonly target: Constructor;
  readonly method: string;
  readonly dto: Constructor;
}

const BODY_ROUTES: readonly BodyRoute[] = [
  {
    target: AuthAccountController,
    method: 'forgotPassword',
    dto: ForgotPasswordDto,
  },
  {
    target: AuthAccountController,
    method: 'resetPassword',
    dto: ResetPasswordDto,
  },
  {
    target: AuthAccountController,
    method: 'verifyEmail',
    dto: VerifyEmailDto,
  },
  {
    target: AuthAccountController,
    method: 'verifyEmailCode',
    dto: VerifyEmailCodeDto,
  },
  {
    target: AuthSessionController,
    method: 'createAnonymousSession',
    dto: AnonymousSessionDto,
  },
  {
    target: AuthSessionController,
    method: 'login',
    dto: LoginDto,
  },
  {
    target: AuthSessionController,
    method: 'register',
    dto: RegisterDto,
  },
  {
    target: AuthSessionController,
    method: 'refresh',
    dto: RefreshTokenDto,
  },
  {
    target: AuthSessionController,
    method: 'logout',
    dto: RefreshTokenDto,
  },
];

// `toContain`/`toHaveProperty` pass on an undefined subject in this vitest, so
// every metadata read is defaulted before it is asserted. See the sibling
// verified-identity-wiring.spec.ts for the same trap.
const metadata = <T>(
  key: string,
  target: object,
  property: string,
  fallback: T
): T =>
  (Reflect.getMetadata(key, target, property) as T | undefined) ?? fallback;

describe('auth request bodies', () => {
  it.each(BODY_ROUTES)(
    '$target.name#$method reaches the validation pipe as a DTO class',
    ({ target, method, dto }) => {
      const paramTypes = metadata<unknown[]>(
        PARAMTYPES_METADATA,
        target.prototype,
        method,
        []
      );

      expect(paramTypes).toContain(dto);
    }
  );

  it.each(BODY_ROUTES)(
    '$target.name#$method binds that DTO as the request body',
    ({ target, method, dto }) => {
      const paramTypes = metadata<unknown[]>(
        PARAMTYPES_METADATA,
        target.prototype,
        method,
        []
      );
      const routeArgs = metadata<Record<string, unknown>>(
        ROUTE_ARGS_METADATA,
        target,
        method,
        {}
      );

      // Without the binding the parameter is `undefined` at runtime and the
      // first property read is a 500 — while the paramtypes row above stays green.
      expect(routeArgs).toHaveProperty(
        `${RouteParamtypes.BODY}:${paramTypes.indexOf(dto)}`
      );
    }
  );
});
