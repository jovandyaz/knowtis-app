import type { CaptureResult } from 'posthog-js';
import { describe, expect, it } from 'vitest';

import { sanitizePostHogEvent } from './privacy';

describe('sanitizePostHogEvent', () => {
  it('templates private first-party routes and strips query strings and fragments', () => {
    const event: CaptureResult = {
      uuid: 'event-1',
      event: '$pageview',
      properties: {
        $current_url: 'https://knowtis.app/notes/550e8400?token=secret#x',
        $pathname: '/notes/550e8400',
        $host: 'knowtis.app',
      },
    };

    expect(sanitizePostHogEvent(event)).toEqual({
      uuid: 'event-1',
      event: '$pageview',
      properties: {
        $current_url: 'https://knowtis.app/notes/:noteId',
        $pathname: '/notes/:noteId',
        $host: 'knowtis.app',
      },
    });
  });

  it('templates shared routes and leaves an ordinary same-origin route query-free', () => {
    const event: CaptureResult = {
      uuid: 'event-2',
      event: '$pageview',
      properties: {
        $current_url: 'https://knowtis.app/s/private-token?utm_source=x',
        $pathname: '/s/private-token',
        $referrer: 'https://knowtis.app/dashboard?utm_source=x#section',
      },
    };

    expect(sanitizePostHogEvent(event)).toEqual({
      uuid: 'event-2',
      event: '$pageview',
      properties: {
        $current_url: 'https://knowtis.app/s/:shareToken',
        $pathname: '/s/:shareToken',
        $referrer: 'https://knowtis.app/dashboard',
      },
    });
  });

  it('keeps only the origin of external referrers and removes malformed URLs', () => {
    const event: CaptureResult = {
      uuid: 'event-3',
      event: '$pageview',
      properties: {
        $referrer: 'https://partner.example/path?code=secret',
        $current_url: 'not a valid URL',
        $pathname: 42,
      },
      $set_once: {
        $initial_referrer: 'also not a URL',
      },
    };

    expect(sanitizePostHogEvent(event)).toEqual({
      uuid: 'event-3',
      event: '$pageview',
      properties: {
        $referrer: 'https://partner.example',
      },
      $set_once: {},
    });
  });

  it('sanitizes SDK URL fields across event and person properties while preserving allowed person fields', () => {
    const event: CaptureResult = {
      uuid: 'event-4',
      event: 'note activated',
      properties: {
        source: 'editor',
        note: 'private note',
        note_id: 'note-1',
        noteId: 'note-2',
        content: 'private content',
        title: 'private title',
        prompt: 'private prompt',
        response: 'private response',
        share_token: 'private-token',
        shareToken: 'private-token-2',
        api_key: 'private-key',
        apiKey: 'private-key-2',
        query: 'private query',
        search_query: 'private search',
        searchQuery: 'private search 2',
        $current_url: 'https://knowtis.app/notes/550e8400?token=secret#x',
      },
      $set: {
        email: 'person@example.com',
        name: 'Person',
        role: 'admin',
        locale: 'es',
        is_internal: true,
        $current_url: 'https://knowtis.app/s/private-token?utm_source=x',
      },
      $set_once: {
        $initial_current_url:
          'https://knowtis.app/notes/550e8400?token=secret#x',
        $initial_referrer: 'https://partner.example/path?code=secret',
      },
    };

    expect(sanitizePostHogEvent(event)).toEqual({
      uuid: 'event-4',
      event: 'note activated',
      properties: {
        source: 'editor',
        $current_url: 'https://knowtis.app/notes/:noteId',
      },
      $set: {
        email: 'person@example.com',
        name: 'Person',
        role: 'admin',
        locale: 'es',
        is_internal: true,
        $current_url: 'https://knowtis.app/s/:shareToken',
      },
      $set_once: {
        $initial_current_url: 'https://knowtis.app/notes/:noteId',
        $initial_referrer: 'https://partner.example',
      },
    });
  });
});
