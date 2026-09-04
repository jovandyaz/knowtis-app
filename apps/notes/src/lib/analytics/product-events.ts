import type { AIAction } from '@knowtis/shared-types';

import { posthog } from '../posthog';

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

let analyticsContext: BrowserActorContext = {
  environment: 'production',
  app_version: import.meta.env.VITE_APP_VERSION || '0.1.0',
  actor_type: 'anonymous',
  is_internal: false,
  locale: 'es',
};

export function captureProductEvent<E extends BrowserProductEventName>(
  event: E,
  properties: BrowserProductEventMap[E]
): void {
  if (!posthog.__loaded) {
    return;
  }
  posthog.capture(event, { ...analyticsContext, ...properties });
}

export function setAnalyticsContext(context: BrowserActorContext): void {
  analyticsContext = context;
  if (posthog.__loaded) {
    posthog.register(context);
  }
}
