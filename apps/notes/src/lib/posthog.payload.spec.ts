import posthog from 'posthog-js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resumeAnalyticsCapture, setAnalyticsReady } from './analytics/runtime';
import { buildPostHogOptions } from './posthog';

const PROJECT_TOKEN = 'phc_payload_spec_project_token';

beforeAll(() => {
  posthog.init(PROJECT_TOKEN, {
    ...buildPostHogOptions('https://analytics.test'),
    persistence: 'memory',
    advanced_disable_flags: true,
    disable_external_dependency_loading: true,
  });
});

beforeEach(() => {
  setAnalyticsReady(true);
  resumeAnalyticsCapture();
});

describe('posthog-js capture payload', () => {
  it('keeps the project token the capture endpoint authenticates the batch with', () => {
    const captured = posthog.capture('note created', { source: 'browser' });

    expect(captured?.properties.token).toBe(PROJECT_TOKEN);
    expect(captured?.properties.source).toBe('browser');
  });

  it('templates the note route the SDK reads off the browser location', () => {
    window.history.pushState({}, '', '/notes/private-note-id?gclid=private');

    const captured = posthog.capture('note opened');

    expect(captured?.properties.$pathname).toBe('/notes/:noteId');
    expect(captured?.properties.gclid).toBeUndefined();
  });
});
