import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import {
  captureProductEvent,
  setAnalyticsContext,
  type BrowserProductEventMap,
} from './product-events';
import { resumeAnalyticsCapture, setAnalyticsReady } from './runtime';

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
    posthog.__loaded = true;
    setAnalyticsReady(true);
    resumeAnalyticsCapture();
    setAnalyticsContext({
      environment: 'production',
      app_version: '0.1.0',
      actor_type: 'anonymous',
      is_internal: false,
      locale: 'en',
    });
    vi.clearAllMocks();
  });

  it('captures only a declared event payload plus the current common context', () => {
    captureProductEvent('note activated', { source: 'editor' });

    expect(posthog.capture).toHaveBeenCalledWith('note activated', {
      environment: 'production',
      app_version: '0.1.0',
      actor_type: 'anonymous',
      is_internal: false,
      locale: 'en',
      source: 'editor',
    });
  });

  it('runtime-picks declared fields from a structurally compatible variable', () => {
    const properties = {
      source: 'editor' as const,
      collaboratorId: 'collaborator-1',
    };

    captureProductEvent('note activated', properties);

    expect(posthog.capture).toHaveBeenCalledWith('note activated', {
      environment: 'production',
      app_version: '0.1.0',
      actor_type: 'anonymous',
      is_internal: false,
      locale: 'en',
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
    setAnalyticsReady(false);
    setAnalyticsContext({
      environment: 'production',
      app_version: 'sha-unloaded',
      actor_type: 'anonymous',
      is_internal: false,
      locale: 'es',
    });

    expect(posthog.register).not.toHaveBeenCalled();

    setAnalyticsReady(true);
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

  it('captures an upgrade CTA click with only its tier and CTA', () => {
    captureProductEvent('ai upgrade cta clicked', {
      from_tier: 'free',
      cta: 'byok',
    });

    expect(posthog.capture).toHaveBeenCalledWith('ai upgrade cta clicked', {
      environment: 'production',
      app_version: '0.1.0',
      actor_type: 'anonymous',
      is_internal: false,
      locale: 'en',
      from_tier: 'free',
      cta: 'byok',
    });
  });

  it('captures the free model menu entry as its own upgrade CTA', () => {
    captureProductEvent('ai upgrade cta clicked', {
      from_tier: 'free',
      cta: 'more_models',
    });

    expect(posthog.capture).toHaveBeenCalledWith('ai upgrade cta clicked', {
      environment: 'production',
      app_version: '0.1.0',
      actor_type: 'anonymous',
      is_internal: false,
      locale: 'en',
      from_tier: 'free',
      cta: 'more_models',
    });
  });

  it('contains capture failures so analytics cannot interrupt product behavior', () => {
    posthog.capture.mockImplementationOnce(() => {
      throw new Error('capture unavailable');
    });

    expect(() =>
      captureProductEvent('note activated', { source: 'editor' })
    ).not.toThrow();
  });

  it('reports registration failures and retains the last completed context', () => {
    setAnalyticsContext({
      environment: 'production',
      app_version: 'sha-completed',
      actor_type: 'anonymous',
      is_internal: false,
      locale: 'es',
    });
    vi.clearAllMocks();
    posthog.register.mockImplementationOnce(() => {
      throw new Error('register unavailable');
    });

    expect(
      setAnalyticsContext({
        environment: 'production',
        app_version: 'sha-after-register-failure',
        actor_type: 'registered',
        is_internal: false,
        locale: 'en',
      })
    ).toBe(false);

    captureProductEvent('note activated', { source: 'editor' });
    expect(posthog.capture).toHaveBeenCalledWith('note activated', {
      environment: 'production',
      app_version: 'sha-completed',
      actor_type: 'anonymous',
      is_internal: false,
      locale: 'es',
      source: 'editor',
    });
  });

  it('captures a Continuar click with only its tier and stop reason', () => {
    captureProductEvent('ai continue clicked', {
      tier: 'free',
      stop_reason: 'time_limit',
    });

    expect(posthog.capture).toHaveBeenCalledWith('ai continue clicked', {
      environment: 'production',
      app_version: '0.1.0',
      actor_type: 'anonymous',
      is_internal: false,
      locale: 'en',
      tier: 'free',
      stop_reason: 'time_limit',
    });
  });

  it('does not expose an arbitrary property escape hatch', () => {
    expectTypeOf<Record<string, unknown>>().not.toExtend<
      BrowserProductEventMap['note activated']
    >();
  });
});
