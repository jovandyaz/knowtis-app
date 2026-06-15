import { describe, expect, it, vi } from 'vitest';

import type { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import { FeatureFlaggedRetrievalAdapter } from './feature-flagged-retrieval.adapter';
import type { HybridRetrievalAdapter } from './hybrid-retrieval.adapter';
import type { KeywordRetrievalAdapter } from './keyword-retrieval.adapter';

function make(enabled: boolean, hybridThrows = false, flagThrows = false) {
  const flags = {
    isEnabled: vi.fn(async () => {
      if (flagThrows) {
        throw new Error('flag service down');
      }
      return enabled;
    }),
  } as unknown as FeatureFlagsService;
  const hybrid = {
    search: vi.fn(async () => {
      if (hybridThrows) {
        throw new Error('boom');
      }
      return [{ id: 'hyb' }] as never;
    }),
  } as unknown as HybridRetrievalAdapter;
  const keyword = {
    search: vi.fn(async () => [{ id: 'kw' }] as never),
  } as unknown as KeywordRetrievalAdapter;
  return {
    adapter: new FeatureFlaggedRetrievalAdapter(flags, hybrid, keyword),
    hybrid,
    keyword,
  };
}

describe('FeatureFlaggedRetrievalAdapter.search', () => {
  it('uses hybrid when the flag is on', async () => {
    const { adapter } = make(true);
    expect((await adapter.search('u', 'q'))[0].id).toBe('hyb');
  });

  it('uses keyword when the flag is off', async () => {
    const { adapter, hybrid } = make(false);
    expect((await adapter.search('u', 'q'))[0].id).toBe('kw');
    expect(hybrid.search).not.toHaveBeenCalled();
  });

  it('degrades to keyword when hybrid throws', async () => {
    const { adapter } = make(true, true);
    expect((await adapter.search('u', 'q'))[0].id).toBe('kw');
  });

  it('degrades to keyword when the flag service throws', async () => {
    const { adapter, keyword } = make(true, false, true);
    expect((await adapter.search('u', 'q'))[0].id).toBe('kw');
    expect(keyword.search).toHaveBeenCalledOnce();
  });
});
