import { describe, expect, it } from 'vitest';

import { sanitizePostHogEvent } from './analytics/privacy';
import { buildPostHogOptions, isPostHogEligible } from './posthog';

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
