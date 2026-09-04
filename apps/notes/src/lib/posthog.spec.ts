import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sanitizePostHogEvent } from './analytics/privacy';
import {
  pauseAnalyticsCapture,
  resumeAnalyticsCapture,
  setAnalyticsReady,
} from './analytics/runtime';
import {
  buildPostHogOptions,
  capturePageview,
  initializePostHog,
  isPostHogEligible,
} from './posthog';

const { posthogClient } = vi.hoisted(() => ({
  posthogClient: {
    __loaded: true,
    capture: vi.fn(),
    init: vi.fn(),
  },
}));

vi.mock('posthog-js', () => ({ default: posthogClient }));

beforeEach(() => {
  vi.clearAllMocks();
  setAnalyticsReady(false);
  pauseAnalyticsCapture();
});

describe('buildPostHogOptions', () => {
  it('disables autocapture so interacted-element text never reaches analytics', () => {
    expect(buildPostHogOptions().autocapture).toBe(false);
  });

  it('masks all inputs and text in session recordings', () => {
    const options = buildPostHogOptions();

    expect(options.session_recording).toMatchObject({
      maskAllInputs: true,
      maskTextSelector: '*',
    });
  });

  it('disables session recording so replay cannot start', () => {
    expect(buildPostHogOptions().disable_session_recording).toBe(true);
  });

  it('uses the provided api host with the proxy fallback', () => {
    expect(buildPostHogOptions('https://ph.example.com').api_host).toBe(
      'https://ph.example.com'
    );
    expect(buildPostHogOptions(undefined).api_host).toBe('/t');
  });

  it('keeps pageview capture disabled and pageleave enabled', () => {
    const options = buildPostHogOptions();

    expect(options.capture_pageview).toBe(false);
    expect(options.capture_pageleave).toBe(true);
  });

  it('applies the final privacy filter before every event is sent', () => {
    expect(buildPostHogOptions().before_send).toBe(sanitizePostHogEvent);
  });
});

describe('isPostHogEligible', () => {
  it('allows only a configured production build on the exact production host', () => {
    expect(
      isPostHogEligible({
        key: 'project-key',
        isDev: false,
        hostname: 'knowtis.app',
      })
    ).toBe(true);
    expect(
      isPostHogEligible({
        key: undefined,
        isDev: false,
        hostname: 'knowtis.app',
      })
    ).toBe(false);
    expect(
      isPostHogEligible({
        key: 'project-key',
        isDev: true,
        hostname: 'knowtis.app',
      })
    ).toBe(false);
    expect(
      isPostHogEligible({
        key: 'project-key',
        isDev: false,
        hostname: 'preview.knowtis.app',
      })
    ).toBe(false);
  });
});

describe('PostHog runtime boundary', () => {
  const initialization = {
    key: 'project-key',
    host: 'https://ph.example.com',
    isDev: false,
    hostname: 'knowtis.app',
  };

  it('contains init failures without marking analytics ready', () => {
    posthogClient.init.mockImplementationOnce(() => {
      throw new Error('init unavailable');
    });

    expect(initializePostHog(posthogClient, initialization)).toBe(false);
    resumeAnalyticsCapture();
    capturePageview();
    expect(posthogClient.capture).not.toHaveBeenCalled();
  });

  it('captures pageviews only when ready and identity-complete without raw URL properties', () => {
    expect(initializePostHog(posthogClient, initialization)).toBe(true);

    capturePageview();
    expect(posthogClient.capture).not.toHaveBeenCalled();

    resumeAnalyticsCapture();
    capturePageview();
    expect(posthogClient.capture).toHaveBeenCalledWith('$pageview');
  });

  it('contains pageview failures without corrupting ready or identity state', () => {
    expect(initializePostHog(posthogClient, initialization)).toBe(true);
    resumeAnalyticsCapture();
    posthogClient.capture.mockImplementationOnce(() => {
      throw new Error('capture unavailable');
    });

    expect(() => capturePageview()).not.toThrow();
    capturePageview();
    expect(posthogClient.capture).toHaveBeenCalledTimes(2);
  });
});
