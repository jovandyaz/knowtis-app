import type { AIAction } from '@knowtis/shared-types';

import { posthog } from '../posthog';
import { runAnalyticsSafely } from './best-effort';
import { canCaptureAnalytics, isAnalyticsReady } from './runtime';

export interface BrowserActorContext {
  environment: 'production';
  app_version: string;
  actor_type: 'anonymous' | 'registered';
  is_internal: boolean;
  locale: string;
}

export interface BrowserProductEventMap {
  'note created': { source: 'browser'; actor_type: 'anonymous' };
  'note activated': { source: 'editor' };
  'shared note viewed': {
    source: 'share_link';
    permission: 'viewer' | 'editor';
    actor_type: 'anonymous' | 'registered';
  };
  'ai response completed': {
    source: 'assistant' | 'copilot' | 'editor';
    assistant_type: 'selection' | 'agent' | 'ghost_text';
    action?: AIAction;
  };
}

export type BrowserProductEventName = keyof BrowserProductEventMap;

const PRODUCT_EVENT_PROPERTY_KEYS = {
  'note created': ['source', 'actor_type'],
  'note activated': ['source'],
  'shared note viewed': ['source', 'permission', 'actor_type'],
  'ai response completed': ['source', 'assistant_type', 'action'],
} as const satisfies {
  [E in BrowserProductEventName]: readonly (keyof BrowserProductEventMap[E])[];
};

let analyticsContext: BrowserActorContext = {
  environment: 'production',
  app_version: import.meta.env.VITE_APP_VERSION || '0.1.0',
  actor_type: 'anonymous',
  is_internal: false,
  locale: 'es',
};

function pickProductEventProperties<E extends BrowserProductEventName>(
  event: E,
  properties: BrowserProductEventMap[E]
): BrowserProductEventMap[E] {
  const picked: Record<string, unknown> = {};
  const provided = properties as Record<string, unknown>;
  for (const key of PRODUCT_EVENT_PROPERTY_KEYS[event]) {
    const value = provided[key];
    if (value !== undefined) {
      picked[key] = value;
    }
  }
  return picked as BrowserProductEventMap[E];
}

export function captureProductEvent<E extends BrowserProductEventName>(
  event: E,
  properties: BrowserProductEventMap[E]
): void {
  if (!canCaptureAnalytics()) {
    return;
  }
  runAnalyticsSafely(() => {
    posthog.capture(event, {
      ...analyticsContext,
      ...pickProductEventProperties(event, properties),
    });
  });
}

export function setAnalyticsContext(context: BrowserActorContext): boolean {
  if (
    isAnalyticsReady() &&
    !runAnalyticsSafely(() => posthog.register(context))
  ) {
    return false;
  }

  analyticsContext = context;
  return true;
}
