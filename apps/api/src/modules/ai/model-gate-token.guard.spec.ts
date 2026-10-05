import {
  NotFoundException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { ModelGateTokenGuard } from './model-gate-token.guard';

const GATE_TOKEN = 'g'.repeat(64);

function guardConfiguredWith(token: string | undefined): ModelGateTokenGuard {
  return new ModelGateTokenGuard({
    get: () => token,
  } as unknown as ConfigService);
}

function requestWith(authorization?: string): ExecutionContext {
  const headers = authorization === undefined ? {} : { authorization };
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('ModelGateTokenGuard', () => {
  it('answers 404 while MODEL_GATE_TOKEN is unset', () => {
    expect(() =>
      guardConfiguredWith(undefined).canActivate(
        requestWith(`Bearer ${GATE_TOKEN}`)
      )
    ).toThrow(NotFoundException);
  });

  it('answers 404 while MODEL_GATE_TOKEN is blank, so an empty bearer never matches it', () => {
    expect(() =>
      guardConfiguredWith('').canActivate(requestWith('Bearer '))
    ).toThrow(NotFoundException);
  });

  it('answers 401 without a bearer', () => {
    expect(() =>
      guardConfiguredWith(GATE_TOKEN).canActivate(requestWith())
    ).toThrow(UnauthorizedException);
  });

  it('answers 401 for a wrong token of a different length', () => {
    expect(() =>
      guardConfiguredWith(GATE_TOKEN).canActivate(requestWith('Bearer short'))
    ).toThrow(UnauthorizedException);
  });

  it('answers 401 for the configured token sent without the Bearer scheme', () => {
    expect(() =>
      guardConfiguredWith(GATE_TOKEN).canActivate(requestWith(GATE_TOKEN))
    ).toThrow(UnauthorizedException);
  });

  it('accepts the configured token', () => {
    expect(
      guardConfiguredWith(GATE_TOKEN).canActivate(
        requestWith(`Bearer ${GATE_TOKEN}`)
      )
    ).toBe(true);
  });
});
