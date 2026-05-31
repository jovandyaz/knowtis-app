import { describe, expect, it, vi } from 'vitest';

import { createTokenRefreshPolicy } from './token-refresh-policy';

function createHandlers(refresh: () => Promise<boolean>) {
  return {
    refresh: vi.fn(refresh),
    onRefreshed: vi.fn(),
    onExhausted: vi.fn(),
    onError: vi.fn(),
  };
}

describe('createTokenRefreshPolicy', () => {
  it('calls onRefreshed when refresh succeeds', async () => {
    const policy = createTokenRefreshPolicy();
    const h = createHandlers(async () => true);

    await policy.recover(h);

    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.onRefreshed).toHaveBeenCalledTimes(1);
    expect(h.onExhausted).not.toHaveBeenCalled();
  });

  it('calls onExhausted when refresh resolves false', async () => {
    const policy = createTokenRefreshPolicy();
    const h = createHandlers(async () => false);

    await policy.recover(h);

    expect(h.onRefreshed).not.toHaveBeenCalled();
    expect(h.onExhausted).toHaveBeenCalledTimes(1);
  });

  it('routes a thrown refresh to onError then onExhausted', async () => {
    const policy = createTokenRefreshPolicy();
    const boom = new Error('network down');
    const h = createHandlers(async () => {
      throw boom;
    });

    await policy.recover(h);

    expect(h.onError).toHaveBeenCalledWith(boom);
    expect(h.onExhausted).toHaveBeenCalledTimes(1);
    expect(h.onRefreshed).not.toHaveBeenCalled();
  });

  it('does not refresh twice: a second recover after a spent attempt exhausts', async () => {
    const policy = createTokenRefreshPolicy();
    const h = createHandlers(async () => true);

    await policy.recover(h);
    await policy.recover(h);

    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.onExhausted).toHaveBeenCalledTimes(1);
  });

  it('ignores re-entrant recover while a refresh is in flight', async () => {
    const policy = createTokenRefreshPolicy();
    let resolve!: (value: boolean) => void;
    const h = createHandlers(() => new Promise<boolean>((r) => (resolve = r)));

    const first = policy.recover(h);
    const second = policy.recover(h);
    resolve(true);
    await Promise.all([first, second]);

    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.onRefreshed).toHaveBeenCalledTimes(1);
    expect(h.onExhausted).not.toHaveBeenCalled();
  });

  it('re-arms after reset', async () => {
    const policy = createTokenRefreshPolicy();
    const h = createHandlers(async () => true);

    await policy.recover(h);
    policy.reset();
    await policy.recover(h);

    expect(h.refresh).toHaveBeenCalledTimes(2);
    expect(h.onRefreshed).toHaveBeenCalledTimes(2);
  });
});
