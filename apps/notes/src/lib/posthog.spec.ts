import { describe, expect, it } from 'vitest';

import { buildPostHogOptions } from './posthog';

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
});
