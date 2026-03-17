import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as
  | string
  | undefined;
const POSTHOG_HOST = import.meta.env.VITE_PUBLIC_POSTHOG_HOST as
  | string
  | undefined;

export function initPostHog(): void {
  if (import.meta.env.DEV || !POSTHOG_KEY) {
    return;
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST || '/t',
    ui_host: 'https://us.posthog.com',
    capture_pageview: false,
    capture_pageleave: true,
  });
}

export { posthog };
