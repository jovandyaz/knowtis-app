import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';

import { useRateLimitState } from './useRateLimitState';

const THROTTLED = new ApiClientError('Too many requests', 429);
const FORBIDDEN = new ApiClientError('Forbidden', 403);

describe('useRateLimitState', () => {
  it('recognises the server throttling the caller', () => {
    const { result } = renderHook(() => useRateLimitState());

    let recognised = false;
    act(() => {
      recognised = result.current.checkRateLimit(THROTTLED);
    });

    expect(recognised).toBe(true);
    expect(result.current.rateLimited).toBe(true);
  });

  it('leaves any other API failure to the caller', () => {
    const { result } = renderHook(() => useRateLimitState());

    let recognised = true;
    act(() => {
      recognised = result.current.checkRateLimit(FORBIDDEN);
    });

    expect(recognised).toBe(false);
    expect(result.current.rateLimited).toBe(false);
  });

  it('ignores a failure that only happens to carry a status of its own', () => {
    const { result } = renderHook(() => useRateLimitState());
    const impostor = Object.assign(new Error('socket closed'), { status: 429 });

    let recognised = true;
    act(() => {
      recognised = result.current.checkRateLimit(impostor);
    });

    expect(recognised).toBe(false);
    expect(result.current.rateLimited).toBe(false);
  });

  it('clears the flag so the next attempt starts clean', () => {
    const { result } = renderHook(() => useRateLimitState());
    act(() => {
      result.current.checkRateLimit(THROTTLED);
    });

    act(() => {
      result.current.resetRateLimit();
    });

    expect(result.current.rateLimited).toBe(false);
  });
});
