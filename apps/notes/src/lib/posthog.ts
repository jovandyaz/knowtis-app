import posthog from 'posthog-js';
import type { PostHogConfig } from 'posthog-js';

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
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '*',
    },
  };
}

export function initPostHog(): void {
  if (import.meta.env.DEV || !POSTHOG_KEY) {
    return;
  }

  posthog.init(POSTHOG_KEY, buildPostHogOptions(POSTHOG_HOST));
}

export { posthog };
