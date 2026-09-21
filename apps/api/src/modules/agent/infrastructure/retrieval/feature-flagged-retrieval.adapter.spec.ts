import { describe, expect, it, vi } from 'vitest';

import type { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import type { RetrievalPort } from '../../domain/ports/retrieval.port';
import type { AgentNote, NoteBody, NoteHit } from '../../domain/retrieval';
import { FeatureFlaggedRetrievalAdapter } from './feature-flagged-retrieval.adapter';
import type { HybridRetrievalAdapter } from './hybrid-retrieval.adapter';
import type { KeywordRetrievalAdapter } from './keyword-retrieval.adapter';

const hit = (id: string): NoteHit => ({
  id,
  title: id,
  updatedAt: '2026-07-01T00:00:00.000Z',
  isOwner: true,
  isSharedWithMe: false,
  isPubliclyShared: false,
});

const KEYWORD_NOTE: AgentNote = {
  ...hit('kw'),
  content: 'kw body',
  contentStatus: 'complete',
  createdAt: '2026-06-01T00:00:00.000Z',
};

const KEYWORD_BODY: NoteBody = {
  title: 'kw',
  html: '<p>kw body</p>',
  updatedAt: KEYWORD_NOTE.updatedAt,
};

function port(over: Partial<RetrievalPort> = {}): RetrievalPort {
  return {
    search: vi.fn(async () => []),
    listUnindexed: vi.fn(async () => []),
    getById: vi.fn(async () => null),
    getBody: vi.fn(async () => null),
    listRecent: vi.fn(async () => []),
    overview: vi.fn(async () => ({ total: 0, owned: 0, sharedWithMe: 0 })),
    ...over,
  };
}

function make(enabled: boolean, hybridThrows = false, flagThrows = false) {
  const flags = {
    isEnabled: vi.fn(async () => {
      if (flagThrows) {
        throw new Error('flag service down');
      }
      return enabled;
    }),
  } as unknown as FeatureFlagsService;
  const hybrid = port({
    search: vi.fn(async () => {
      if (hybridThrows) {
        throw new Error('boom');
      }
      return [hit('hyb')];
    }),
    listUnindexed: vi.fn(async () => [hit('pending')]),
  });
  const keyword = port({
    search: vi.fn(async () => [hit('kw')]),
    getById: vi.fn(async () => KEYWORD_NOTE),
    getBody: vi.fn(async () => KEYWORD_BODY),
  });
  return {
    adapter: new FeatureFlaggedRetrievalAdapter(
      flags,
      hybrid as unknown as HybridRetrievalAdapter,
      keyword as unknown as KeywordRetrievalAdapter
    ),
    flags,
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

describe('FeatureFlaggedRetrievalAdapter.listUnindexed', () => {
  it('reports pending notes when the flag is on', async () => {
    const { adapter } = make(true);
    expect((await adapter.listUnindexed('u', 5))[0].id).toBe('pending');
  });

  it('reports none when the flag is off, since there is no vector leg to lag behind', async () => {
    const { adapter, hybrid } = make(false);
    expect(await adapter.listUnindexed('u', 5)).toEqual([]);
    expect(hybrid.listUnindexed).not.toHaveBeenCalled();
  });

  it('reports none when the flag service is down', async () => {
    const { adapter } = make(true, false, true);
    expect(await adapter.listUnindexed('u', 5)).toEqual([]);
  });
});

describe('FeatureFlaggedRetrievalAdapter note reads', () => {
  it('serves getBody from keyword whatever the flag says', async () => {
    const { adapter, flags, hybrid, keyword } = make(true);

    expect(await adapter.getBody('u', 'n')).toBe(KEYWORD_BODY);
    expect(keyword.getBody).toHaveBeenCalledWith('u', 'n');
    expect(hybrid.getBody).not.toHaveBeenCalled();
    expect(flags.isEnabled).not.toHaveBeenCalled();
  });

  it('passes through a missing note without consulting the flag', async () => {
    const { adapter, flags, hybrid, keyword } = make(true);
    keyword.getBody = vi.fn(async () => null);

    expect(await adapter.getBody('u', 'n')).toBeNull();
    expect(hybrid.getBody).not.toHaveBeenCalled();
    expect(flags.isEnabled).not.toHaveBeenCalled();
  });

  it('lets a keyword read failure surface instead of degrading to hybrid', async () => {
    const { adapter, flags, hybrid, keyword } = make(true);
    keyword.getBody = vi.fn(async () => {
      throw new Error('note store down');
    });

    await expect(adapter.getBody('u', 'n')).rejects.toThrow('note store down');
    expect(hybrid.getBody).not.toHaveBeenCalled();
    expect(flags.isEnabled).not.toHaveBeenCalled();
  });

  it('serves getById from keyword whatever the flag says', async () => {
    const { adapter, flags, hybrid, keyword } = make(true);

    expect(await adapter.getById('u', 'n')).toBe(KEYWORD_NOTE);
    expect(keyword.getById).toHaveBeenCalledWith('u', 'n');
    expect(hybrid.getById).not.toHaveBeenCalled();
    expect(flags.isEnabled).not.toHaveBeenCalled();
  });
});
