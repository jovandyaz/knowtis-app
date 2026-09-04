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

  it('sanitizes PostHog pageview and pageleave paths and drops query-derived acquisition fields', () => {
    const pageview: CaptureResult = {
      uuid: 'event-pageview',
      event: '$pageview',
      properties: {
        $current_url:
          'https://knowtis.app/notes/private-note-id?search=private-query',
        $pathname: '/notes/private-note-id',
        $prev_pageview_pathname: '/s/private-share-token?code=private-code',
        $session_entry_url:
          'https://knowtis.app/notes/private-entry-note?utm_source=private-source',
        $session_entry_referrer:
          'https://partner.example/private/path?code=private-code',
        $session_entry_pathname: '/s/private-entry-share-token',
        ph_keyword: 'private-keyword',
        $utm_medium: 'private-medium',
        utmCampaign: 'private-campaign',
        gclid: 'private-google-click-id',
        clickId: 'private-click-id',
        searchEngine: 'private-search-engine',
        $session_entry_gclid: 'private-session-google-click-id',
        $session_entry_fbclid: 'private-session-facebook-click-id',
        $session_entry_mc_cid: 'private-session-mailchimp-id',
        $session_entry_utm_source: 'private-session-source',
        $initial_gclid: 'private-initial-google-click-id',
        $initial_utm_campaign: 'private-initial-campaign',
        $session_entry_referring_domain: 'partner.example',
        $geoip_country_code: 'MX',
      },
    };
    const pageleave: CaptureResult = {
      uuid: 'event-pageleave',
      event: '$pageleave',
      properties: {
        $current_url:
          'https://knowtis.app/s/private-share-token?utm_source=private-source',
        $pathname: '/s/private-share-token',
        $prev_pageview_pathname: '/notes/private-note-id#private-fragment',
        fbclid: 'private-facebook-click-id',
        fbClid: 'private-facebook-camel-click-id',
        g_clid: 'private-google-snake-click-id',
        msClkId: 'private-microsoft-camel-click-id',
        campaign_id: 'private-campaign-id',
        search_query: 'private-search-query',
      },
    };

    expect(sanitizePostHogEvent(pageview)).toEqual({
      uuid: 'event-pageview',
      event: '$pageview',
      properties: {
        $current_url: 'https://knowtis.app/notes/:noteId',
        $pathname: '/notes/:noteId',
        $prev_pageview_pathname: '/s/:shareToken',
        $session_entry_url: 'https://knowtis.app/notes/:noteId',
        $session_entry_referrer: 'https://partner.example',
        $session_entry_pathname: '/s/:shareToken',
        $session_entry_referring_domain: 'partner.example',
        $geoip_country_code: 'MX',
      },
    });
    expect(sanitizePostHogEvent(pageleave)).toEqual({
      uuid: 'event-pageleave',
      event: '$pageleave',
      properties: {
        $current_url: 'https://knowtis.app/s/:shareToken',
        $pathname: '/s/:shareToken',
        $prev_pageview_pathname: '/notes/:noteId',
      },
    });
  });

  it('drops replay snapshots containing current, DOM, and nested href values', () => {
    const replayEvent = {
      uuid: 'event-replay',
      event: '$snapshot',
      properties: {
        $current_url: 'https://knowtis.app/notes/private-note-id',
        $snapshot_data: {
          href: 'https://knowtis.app/s/private-share-token',
          nested: {
            attributes: {
              href: 'https://knowtis.app/notes/another-private-note-id',
            },
          },
        },
      },
    } as unknown as CaptureResult;

    expect(sanitizePostHogEvent(replayEvent)).toBeNull();
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
        collaboratorId: 'collaborator-1',
        sourceText: 'private source text',
        modelOutput: 'private model output',
        cost: 42,
        $current_url: 'https://knowtis.app/notes/550e8400?token=secret#x',
      },
      $set: {
        email: 'person@example.com',
        name: 'Person',
        role: 'admin',
        locale: 'es',
        is_internal: true,
        noteId: 'note-person-1',
        content: 'private person content',
        prompt: 'private person prompt',
        collaboratorId: 'collaborator-person-1',
        sourceText: 'private person source text',
        modelOutput: 'private person model output',
        cost: 84,
        $current_url: 'https://knowtis.app/s/private-token?utm_source=x',
      },
      $set_once: {
        $initial_current_url:
          'https://knowtis.app/notes/550e8400?token=secret#x',
        $initial_referrer: 'https://partner.example/path?code=secret',
        token: 'private-once-token',
        collaboratorId: 'collaborator-once-1',
        sourceText: 'private once source text',
        modelOutput: 'private once model output',
        cost: 126,
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

  it('keeps the SDK project token while stripping token-shaped first-party fields', () => {
    const event: CaptureResult = {
      uuid: 'event-6',
      event: 'note created',
      properties: {
        token: 'phc_public_project_token',
        share_token: 'private-share-token',
        apiToken: 'private-api-token',
        refresh_tokens: 'private-refresh-tokens',
      },
      $set_once: {
        token: 'private-person-token',
      },
    };

    expect(sanitizePostHogEvent(event)).toEqual({
      uuid: 'event-6',
      event: 'note created',
      properties: {
        token: 'phc_public_project_token',
      },
      $set_once: {},
    });
  });

  it('applies the person allowlist to $set and $set_once nested inside event properties', () => {
    const personUpdate: CaptureResult = {
      uuid: 'event-5',
      event: '$set',
      properties: {
        $set: {
          email: 'person@example.com',
          name: 'Person',
          role: 'user',
          locale: 'es',
          is_internal: false,
          noteId: 'note-person-1',
          $current_url: 'https://knowtis.app/notes/550e8400?token=secret',
        },
        $set_once: {
          $initial_current_url: 'https://knowtis.app/s/private-token?x=1',
          $initial_gclid: 'private-initial-google-click-id',
        },
        $current_url: 'https://knowtis.app/notes/550e8400',
      },
    };

    expect(sanitizePostHogEvent(personUpdate)).toEqual({
      uuid: 'event-5',
      event: '$set',
      properties: {
        $set: {
          email: 'person@example.com',
          name: 'Person',
          role: 'user',
          locale: 'es',
          is_internal: false,
          $current_url: 'https://knowtis.app/notes/:noteId',
        },
        $set_once: {
          $initial_current_url: 'https://knowtis.app/s/:shareToken',
        },
        $current_url: 'https://knowtis.app/notes/:noteId',
      },
    });
  });
});
