import { describe, expect, it, vi } from 'vitest';

import { ProviderCooldownTracker } from './provider-cooldown.tracker';

function makeTracker(nowRef: { value: number }) {
  const logger = { warn: vi.fn(), error: vi.fn() };
  const tracker = new ProviderCooldownTracker(
    { allowedFails: 3, cooldownSeconds: 120 },
    logger,
    () => nowRef.value
  );
  return { tracker, logger };
}

describe('ProviderCooldownTracker', () => {
  it('starts cooling after the failure threshold inside the window', () => {
    const now = { value: 1_000 };
    const { tracker, logger } = makeTracker(now);

    tracker.recordFailure('anthropic');
    tracker.recordFailure('anthropic');
    expect(tracker.isCooling('anthropic')).toBe(false);

    tracker.recordFailure('anthropic');
    expect(tracker.isCooling('anthropic')).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai.provider.cooldown_start',
        provider: 'anthropic',
      })
    );
  });

  it('does not trip when failures fall outside the rolling window', () => {
    const now = { value: 0 };
    const { tracker } = makeTracker(now);

    tracker.recordFailure('anthropic');
    now.value += 61_000;
    tracker.recordFailure('anthropic');
    now.value += 61_000;
    tracker.recordFailure('anthropic');

    expect(tracker.isCooling('anthropic')).toBe(false);
  });

  it('expires the cooldown after cooldownSeconds', () => {
    const now = { value: 0 };
    const { tracker, logger } = makeTracker(now);

    for (let i = 0; i < 3; i++) {
      tracker.recordFailure('openai');
    }
    expect(tracker.isCooling('openai')).toBe(true);

    now.value += 120_001;
    expect(tracker.isCooling('openai')).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai.provider.cooldown_end',
        reason: 'expired',
      })
    );
  });

  it('ends the cooldown immediately on success', () => {
    const now = { value: 0 };
    const { tracker, logger } = makeTracker(now);

    for (let i = 0; i < 3; i++) {
      tracker.recordFailure('google');
    }
    expect(tracker.isCooling('google')).toBe(true);

    tracker.recordSuccess('google');
    expect(tracker.isCooling('google')).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ai.provider.cooldown_end',
        reason: 'success',
      })
    );
  });

  it('tracks providers independently', () => {
    const now = { value: 0 };
    const { tracker } = makeTracker(now);

    for (let i = 0; i < 3; i++) {
      tracker.recordFailure('anthropic');
    }
    expect(tracker.isCooling('anthropic')).toBe(true);
    expect(tracker.isCooling('openai')).toBe(false);
  });

  it('exposes a health snapshot per provider', () => {
    const now = { value: 5_000 };
    const { tracker } = makeTracker(now);

    tracker.recordFailure('anthropic');
    tracker.recordSuccess('openai');

    const snapshot = tracker.snapshot();
    expect(snapshot['anthropic']).toMatchObject({
      cooling: false,
      failureCount: 1,
      lastFailureAt: 5_000,
    });
    expect(snapshot['openai']).toMatchObject({
      cooling: false,
      failureCount: 0,
      lastSuccessAt: 5_000,
    });
  });
});
