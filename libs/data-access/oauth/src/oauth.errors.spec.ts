import { describe, expect, it } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';

import { classifyConsentError, isOauthDisabledError } from './oauth.errors';

describe('classifyConsentError', () => {
  it('marks a 409 (already resolved) as terminal', () => {
    expect(classifyConsentError(new ApiClientError('Conflict', 409))).toEqual({
      kind: 'alreadyResolved',
      terminal: true,
    });
  });

  it('marks a 404 (unknown interaction) as terminal expiry', () => {
    expect(classifyConsentError(new ApiClientError('Not Found', 404))).toEqual({
      kind: 'expired',
      terminal: true,
    });
  });

  it('marks a 410 (gone) as terminal expiry', () => {
    expect(classifyConsentError(new ApiClientError('Gone', 410))).toEqual({
      kind: 'expired',
      terminal: true,
    });
  });

  it('marks a 401 (session expired mid-consent) as terminal', () => {
    expect(
      classifyConsentError(new ApiClientError('Unauthorized', 401))
    ).toEqual({ kind: 'sessionExpired', terminal: true });
  });

  it('marks a 5xx as retryable', () => {
    expect(
      classifyConsentError(new ApiClientError('Server Error', 503))
    ).toEqual({ kind: 'retryable', terminal: false });
  });

  it('marks a network error (non-ApiClientError) as retryable', () => {
    expect(classifyConsentError(new Error('Network down'))).toEqual({
      kind: 'retryable',
      terminal: false,
    });
  });
});

describe('isOauthDisabledError', () => {
  it('is true for a 404 ApiClientError', () => {
    expect(isOauthDisabledError(new ApiClientError('Not Found', 404))).toBe(
      true
    );
  });

  it('is false for other statuses, plain errors, and no error', () => {
    expect(isOauthDisabledError(new ApiClientError('Server Error', 503))).toBe(
      false
    );
    expect(isOauthDisabledError(new Error('Network down'))).toBe(false);
    expect(isOauthDisabledError(null)).toBe(false);
  });
});
