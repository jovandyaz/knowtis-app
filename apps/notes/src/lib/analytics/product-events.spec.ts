import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  captureProductEvent,
  setAnalyticsContext,
  type BrowserProductEventMap,
} from './product-events';

const { posthog } = vi.hoisted(() => ({
  posthog: {
    __loaded: true,
    capture: vi.fn(),
    register: vi.fn(),
  },
}));

vi.mock('../posthog', () => ({ posthog }));

describe('browser product events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    posthog.__loaded = true;
  });

  it('captures only a declared event payload plus the current common context', () => {
    captureProductEvent('note activated', { source: 'editor' });

    expect(posthog.capture).toHaveBeenCalledWith('note activated', {
      environment: 'production',
      app_version: '0.1.0',
      actor_type: 'anonymous',
      is_internal: false,
      locale: 'es',
      source: 'editor',
    });
  });

  it('replaces and registers the typed analytics context when loaded', () => {
    setAnalyticsContext({
      environment: 'production',
      app_version: 'sha-123',
      actor_type: 'registered',
      is_internal: true,
      locale: 'en',
    });

    expect(posthog.register).toHaveBeenCalledWith({
      environment: 'production',
      app_version: 'sha-123',
      actor_type: 'registered',
      is_internal: true,
      locale: 'en',
    });
    captureProductEvent('note activated', { source: 'editor' });
    expect(posthog.capture).toHaveBeenLastCalledWith('note activated', {
      environment: 'production',
      app_version: 'sha-123',
      actor_type: 'registered',
      is_internal: true,
      locale: 'en',
      source: 'editor',
    });
  });

  it('replaces context without registering while PostHog is not loaded', () => {
    posthog.__loaded = false;
    setAnalyticsContext({
      environment: 'production',
      app_version: 'sha-unloaded',
      actor_type: 'anonymous',
      is_internal: false,
      locale: 'es',
    });

    expect(posthog.register).not.toHaveBeenCalled();

    posthog.__loaded = true;
    captureProductEvent('note activated', { source: 'editor' });
    expect(posthog.capture).toHaveBeenCalledWith('note activated', {
      environment: 'production',
      app_version: 'sha-unloaded',
      actor_type: 'anonymous',
      is_internal: false,
      locale: 'es',
      source: 'editor',
    });
  });

  it('does not expose an arbitrary property escape hatch', () => {
    expectTypeOf<Record<string, unknown>>().not.toExtend<
      BrowserProductEventMap['note activated']
    >();
    expect(posthog.capture).not.toHaveBeenCalled();
  });
});
