import posthog from 'posthog-js';
import type { PostHog, PostHogConfig } from 'posthog-js';

import { runAnalyticsSafely } from './analytics/best-effort';
import { sanitizePostHogEvent } from './analytics/privacy';
import { canCaptureAnalytics, setAnalyticsReady } from './analytics/runtime';

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as
  | string
  | undefined;
const POSTHOG_HOST = import.meta.env.VITE_PUBLIC_POSTHOG_HOST as
  | string
  | undefined;

export function buildPostHogOptions(host?: string): Partial<PostHogConfig> {
  return {
    api_host: host || '/t',
    ui_host: 'https://us.posthog.com',
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    disable_session_recording: true,
    before_send: sanitizePostHogEvent,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '*',
    },
  };
}

interface PostHogEligibilityInput {
  key: string | undefined;
  isDev: boolean;
  hostname: string;
}

interface PostHogInitializationInput extends PostHogEligibilityInput {
  host: string | undefined;
}

export function isPostHogEligible({
  key,
  isDev,
  hostname,
}: PostHogEligibilityInput): boolean {
  return Boolean(key) && !isDev && hostname === 'knowtis.app';
}

export function initializePostHog(
  client: Pick<PostHog, 'init'>,
  input: PostHogInitializationInput
): boolean {
  const key = input.key;
  if (!key || !isPostHogEligible(input)) {
    return false;
  }

  const initialized = runAnalyticsSafely(() => {
    client.init(key, buildPostHogOptions(input.host));
  });
  if (initialized) {
    setAnalyticsReady(true);
  }
  return initialized;
}

export function initPostHog(): boolean {
  return initializePostHog(posthog, {
    key: POSTHOG_KEY,
    host: POSTHOG_HOST,
    isDev: import.meta.env.DEV,
    hostname: window.location.hostname,
  });
}

export function capturePageview(): void {
  if (!canCaptureAnalytics()) {
    return;
  }
  runAnalyticsSafely(() => posthog.capture('$pageview'));
}

export { posthog };
