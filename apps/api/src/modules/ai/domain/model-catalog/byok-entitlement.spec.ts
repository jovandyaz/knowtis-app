import { describe, expect, it } from 'vitest';

import type { ByokProvider } from '@knowtis/shared-types';

import { snapshotRouteId } from '../../testing/snapshot-route';
import {
  entitledIdsOf,
  entitlementsFrom,
  isEntitled,
  NO_ENTITLEMENTS,
  type StoredListing,
} from './byok-entitlement';
import { slugOf } from './catalog-model';

function entitlementsOf(provider: ByokProvider, listed: readonly string[]) {
  return new Map([[provider, entitledIdsOf(listed)]]);
}

describe('isEntitled', () => {
  it('entitles a route its listing names exactly', () => {
    const id = snapshotRouteId('balanced', 'anthropic');

    expect(isEntitled(id, entitlementsOf('anthropic', [slugOf(id)]))).toBe(
      true
    );
  });

  it('entitles an undated route whose listing names only its -YYYYMMDD snapshot', () => {
    const id = snapshotRouteId('fast', 'anthropic');

    expect(
      isEntitled(id, entitlementsOf('anthropic', [`${slugOf(id)}-20251001`]))
    ).toBe(true);
  });

  it('entitles an undated route whose listing names only its -YYYY-MM-DD snapshot', () => {
    const id = snapshotRouteId('fast', 'anthropic');

    expect(
      isEntitled(id, entitlementsOf('anthropic', [`${slugOf(id)}-2025-10-01`]))
    ).toBe(true);
  });

  it('never entitles a route that only prefixes a listed id', () => {
    expect(
      isEntitled(
        'anthropic:claude-sonnet-5',
        entitlementsOf('anthropic', ['claude-sonnet-5-5'])
      )
    ).toBe(false);
  });

  it('does not read a four-digit suffix as a date', () => {
    expect(
      isEntitled(
        'openrouter:deepseek/deepseek-v4-pro',
        entitlementsOf('openrouter', ['deepseek/deepseek-v4-pro-0813'])
      )
    ).toBe(false);
  });

  it('entitles an OpenRouter route by its author/slug', () => {
    const id = snapshotRouteId('fast', 'openrouter');

    expect(isEntitled(id, entitlementsOf('openrouter', [slugOf(id)]))).toBe(
      true
    );
    expect(isEntitled(id, entitlementsOf('openrouter', ['other/model']))).toBe(
      false
    );
  });

  it('entitles every route of a provider without a listing', () => {
    expect(
      isEntitled(
        snapshotRouteId('fast', 'openai'),
        entitlementsOf('anthropic', ['claude-haiku-4-5'])
      )
    ).toBe(true);
    expect(isEntitled(snapshotRouteId('fast', 'openai'), NO_ENTITLEMENTS)).toBe(
      true
    );
  });

  it('entitles a model of a provider outside BYOK', () => {
    expect(
      isEntitled(
        'deepseek:deepseek-chat',
        entitlementsOf('anthropic', ['claude-haiku-4-5'])
      )
    ).toBe(true);
  });

  it('never reads a held provider out of an id without a provider separator', () => {
    expect(
      isEntitled('googlex', entitlementsOf('google', ['gemini-3.8-flash']))
    ).toBe(true);
  });
});

describe('entitlementsFrom', () => {
  const listing: StoredListing = {
    provider: 'anthropic',
    keyFingerprint: 'current',
    modelIds: ['claude-haiku-4-5-20251001'],
  };

  it('keeps a listing of the key the caller holds now', () => {
    const entitlements = entitlementsFrom(
      [listing],
      new Map([['anthropic', 'current']])
    );

    expect(entitlements.get('anthropic')).toEqual(
      new Set(['claude-haiku-4-5-20251001', 'claude-haiku-4-5'])
    );
  });

  it('drops a listing whose fingerprint no longer matches the key', () => {
    const entitlements = entitlementsFrom(
      [listing],
      new Map([['anthropic', 'rotated']])
    );

    expect(entitlements.has('anthropic')).toBe(false);
    expect(
      isEntitled(snapshotRouteId('balanced', 'anthropic'), entitlements)
    ).toBe(true);
  });

  it('drops a listing for a key that no longer decrypts', () => {
    const entitlements = entitlementsFrom([listing], new Map());

    expect(entitlements.has('anthropic')).toBe(false);
  });
});
