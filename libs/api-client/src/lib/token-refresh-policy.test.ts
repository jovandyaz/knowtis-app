import { describe, expect, it, vi } from 'vitest';

import {
  createTokenRefreshPolicy,
  type RefreshOutcome,
} from './token-refresh-policy';

function createHandlers(refresh: () => Promise<RefreshOutcome>) {
  return {
    refresh: vi.fn(refresh),
    onRefreshed: vi.fn(),
    onExhausted: vi.fn(),
    onUnavailable: vi.fn(),
    onError: vi.fn(),
  };
}

describe('createTokenRefreshPolicy', () => {
  it('calls onRefreshed when refresh succeeds', async () => {
    const policy = createTokenRefreshPolicy();
    const h = createHandlers(async () => 'refreshed');

    await policy.recover(h);

    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.onRefreshed).toHaveBeenCalledTimes(1);
    expect(h.onExhausted).not.toHaveBeenCalled();
  });

  it('calls onExhausted when the credential is rejected', async () => {
    const policy = createTokenRefreshPolicy();
    const h = createHandlers(async () => 'rejected');

    await policy.recover(h);

    expect(h.onRefreshed).not.toHaveBeenCalled();
    expect(h.onExhausted).toHaveBeenCalledTimes(1);
  });

  it('routes an unavailable refresh to onUnavailable, never to onExhausted', async () => {
    const policy = createTokenRefreshPolicy();
    const h = createHandlers(async () => 'unavailable');

    await policy.recover(h);

    expect(h.onUnavailable).toHaveBeenCalledTimes(1);
    expect(h.onExhausted).not.toHaveBeenCalled();
    expect(h.onRefreshed).not.toHaveBeenCalled();
  });

  it('does not spend the attempt on an unavailable refresh', async () => {
    const policy = createTokenRefreshPolicy();
    const outcomes: RefreshOutcome[] = ['unavailable', 'refreshed'];
    const h = createHandlers(async () => outcomes.shift() ?? 'rejected');

    await policy.recover(h);
    await policy.recover(h);

    expect(h.refresh).toHaveBeenCalledTimes(2);
    expect(h.onRefreshed).toHaveBeenCalledTimes(1);
    expect(h.onExhausted).not.toHaveBeenCalled();
  });

  it('still spends the attempt once the credential is rejected', async () => {
    const policy = createTokenRefreshPolicy();
    const h = createHandlers(async () => 'rejected');

    await policy.recover(h);
    await policy.recover(h);

    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.onExhausted).toHaveBeenCalledTimes(2);
  });

  it('treats a thrown refresh as unavailable, reporting it through onError', async () => {
    const policy = createTokenRefreshPolicy();
    const boom = new Error('network down');
    const h = createHandlers(async () => {
      throw boom;
    });

    await policy.recover(h);

    expect(h.onError).toHaveBeenCalledWith(boom);
    expect(h.onUnavailable).toHaveBeenCalledTimes(1);
    expect(h.onExhausted).not.toHaveBeenCalled();
    expect(h.onRefreshed).not.toHaveBeenCalled();
  });

  it('does not refresh twice: a second recover after a spent attempt exhausts', async () => {
    const policy = createTokenRefreshPolicy();
    const h = createHandlers(async () => 'refreshed');

    await policy.recover(h);
    await policy.recover(h);

    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.onExhausted).toHaveBeenCalledTimes(1);
  });

  it('ignores re-entrant recover while a refresh is in flight', async () => {
    const policy = createTokenRefreshPolicy();
    let resolve!: (value: RefreshOutcome) => void;
    const h = createHandlers(
      () => new Promise<RefreshOutcome>((r) => (resolve = r))
    );

    const first = policy.recover(h);
    const second = policy.recover(h);
    resolve('refreshed');
    await Promise.all([first, second]);

    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.onRefreshed).toHaveBeenCalledTimes(1);
    expect(h.onExhausted).not.toHaveBeenCalled();
  });

  it('re-arms after reset', async () => {
    const policy = createTokenRefreshPolicy();
    const h = createHandlers(async () => 'refreshed');

    await policy.recover(h);
    policy.reset();
    await policy.recover(h);

    expect(h.refresh).toHaveBeenCalledTimes(2);
    expect(h.onRefreshed).toHaveBeenCalledTimes(2);
  });
});
