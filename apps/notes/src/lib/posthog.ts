import posthog from 'posthog-js';
import type { PostHogConfig } from 'posthog-js';

import { sanitizePostHogEvent } from './analytics/privacy';

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

export function isPostHogEligible({
  key,
  isDev,
  hostname,
}: PostHogEligibilityInput): boolean {
  return Boolean(key) && !isDev && hostname === 'knowtis.app';
}

export function initPostHog(): void {
  if (
    !POSTHOG_KEY ||
    !isPostHogEligible({
      key: POSTHOG_KEY,
      isDev: import.meta.env.DEV,
      hostname: window.location.hostname,
    })
  ) {
    return;
  }

  posthog.init(POSTHOG_KEY, buildPostHogOptions(POSTHOG_HOST));
}

export { posthog };
