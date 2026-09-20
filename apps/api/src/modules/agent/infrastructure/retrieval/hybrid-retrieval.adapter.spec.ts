import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { AIRateLimitService } from '../../../ai/application/services/ai-rate-limit.service';
import type { EmbeddingPort } from '../../../ai/domain/ports/embedding.port';
import type { NoteReadRepository } from '../../../notes/domain/ports/note-read.repository';
import type { RetrievalPort } from '../../domain/ports/retrieval.port';
import type { AgentNote, NoteBody } from '../../domain/retrieval';
import { HybridRetrievalAdapter } from './hybrid-retrieval.adapter';
import type { KeywordRetrievalAdapter } from './keyword-retrieval.adapter';

const KEYWORD_NOTE: AgentNote = {
  id: 'kw',
  title: 'kw',
  content: 'kw body',
  contentStatus: 'complete',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  isOwner: true,
  isSharedWithMe: false,
  isPubliclyShared: false,
};

const KEYWORD_BODY: NoteBody = {
  title: 'kw',
  html: '<p>kw body</p>',
  updatedAt: KEYWORD_NOTE.updatedAt,
};

function summary(id: string) {
  return {
    id,
    title: id,
    ownerId: 'u1',
    generalAccess: 'restricted',
    shareToken: null,
    createdAt: new Date(),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
  };
}

function make(opts: {
  lexical: string[];
  vector: string[];
  embedThrows?: boolean;
  unindexed?: string[];
  voyageKey?: string;
}) {
  const repo = {
    findAccessibleNotesByLexicalRank: vi.fn(async () =>
      opts.lexical.map(summary)
    ),
    findAccessibleNotesByEmbedding: vi.fn(async () => opts.vector.map(summary)),
    findAccessibleNotesUnindexed: vi.fn(async () =>
      (opts.unindexed ?? []).map(summary)
    ),
  } as unknown as NoteReadRepository;
  const embed = {
    embedQuery: vi.fn(async () => {
      if (opts.embedThrows) {
        throw new Error('voyage down');
      }
      return { vector: new Array(1024).fill(0), costUsd: 0.001 };
    }),
    embedDocuments: vi.fn(),
  } as unknown as EmbeddingPort;
  const keyword: RetrievalPort = {
    search: vi.fn(async () => []),
    listUnindexed: vi.fn(async () => []),
    getById: vi.fn(async () => KEYWORD_NOTE),
    getBody: vi.fn(async () => KEYWORD_BODY),
    listRecent: vi.fn(async () => []),
    overview: vi.fn(async () => ({ total: 0, owned: 0, sharedWithMe: 0 })),
  };
  const config = {
    get: (key: string) =>
      key === 'VOYAGE_API_KEY' ? (opts.voyageKey ?? 'vk-test') : 'voyage-4',
  } as unknown as ConfigService<Record<string, unknown>, true>;
  const rateLimit = {
    recordSideCost: vi.fn().mockResolvedValue(undefined),
  } as unknown as AIRateLimitService;
  return {
    adapter: new HybridRetrievalAdapter(
      repo,
      embed,
      keyword as unknown as KeywordRetrievalAdapter,
      config,
      rateLimit
    ),
    repo,
    embed,
    keyword,
    rateLimit,
  };
}

describe('HybridRetrievalAdapter.search', () => {
  it('fuses both legs (note in both legs ranks first)', async () => {
    const { adapter } = make({ lexical: ['a', 'b'], vector: ['b', 'c'] });
    const hits = await adapter.search('u1', 'q');
    expect(hits[0].id).toBe('b');
  });

  it('records the query-embedding side cost against the requesting user', async () => {
    const { adapter, rateLimit } = make({ lexical: ['a'], vector: ['a'] });
    await adapter.search('u1', 'q');
    expect(rateLimit.recordSideCost).toHaveBeenCalledWith({
      userId: 'u1',
      action: 'embedding',
      model: 'voyage-4',
      costUsd: 0.001,
      byokTurn: false,
    });
  });

  it('falls back to lexical-only when embedding fails', async () => {
    const { adapter, repo } = make({
      lexical: ['a'],
      vector: [],
      embedThrows: true,
    });
    const hits = await adapter.search('u1', 'q');
    expect(hits.map((h) => h.id)).toEqual(['a']);
    expect(repo.findAccessibleNotesByEmbedding).not.toHaveBeenCalled();
  });

  it('does not record a side cost when the embedding call fails', async () => {
    const { adapter, rateLimit } = make({
      lexical: ['a'],
      vector: [],
      embedThrows: true,
    });
    await adapter.search('u1', 'q');
    expect(rateLimit.recordSideCost).not.toHaveBeenCalled();
  });
});

describe('HybridRetrievalAdapter.listUnindexed', () => {
  it('asks the repository for notes the current embedding model cannot reach', async () => {
    const { adapter, repo } = make({
      lexical: [],
      vector: [],
      unindexed: ['fresh'],
    });

    const hits = await adapter.listUnindexed('u1', 5);

    expect(hits.map((h) => h.id)).toEqual(['fresh']);
    expect(repo.findAccessibleNotesUnindexed).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'u1' }),
      'voyage-4',
      expect.any(Number),
      5
    );
  });

  it('bounds the claim to a window a healthy reconciler could cover', async () => {
    const { adapter, repo } = make({ lexical: [], vector: [] });

    await adapter.listUnindexed('u1', 5);

    const [, , withinSeconds] = vi.mocked(repo.findAccessibleNotesUnindexed)
      .mock.calls[0];
    // Longer than one quiet period plus cycle (90 + 120 s), short enough that a
    // note stuck for hours stops being reported as pending.
    expect(withinSeconds).toBeGreaterThan(210);
    expect(withinSeconds).toBeLessThanOrEqual(3600);
  });

  it('reports none when no Voyage key is configured, so nothing is ever indexed', async () => {
    const { adapter, repo } = make({
      lexical: [],
      vector: [],
      unindexed: ['fresh'],
      voyageKey: '',
    });

    expect(await adapter.listUnindexed('u1', 5)).toEqual([]);
    expect(repo.findAccessibleNotesUnindexed).not.toHaveBeenCalled();
  });

  it('reports none for an unusable user id', async () => {
    const { adapter, repo } = make({ lexical: [], vector: [] });

    expect(await adapter.listUnindexed('', 5)).toEqual([]);
    expect(repo.findAccessibleNotesUnindexed).not.toHaveBeenCalled();
  });
});

describe('HybridRetrievalAdapter note reads', () => {
  it('delegates getBody to the keyword adapter, never to the vector leg', async () => {
    const { adapter, keyword, embed } = make({ lexical: [], vector: [] });

    expect(await adapter.getBody('u1', 'n1')).toBe(KEYWORD_BODY);
    expect(keyword.getBody).toHaveBeenCalledWith('u1', 'n1');
    expect(embed.embedQuery).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing note', null],
    ['an inaccessible note', null],
  ])('passes through what keyword returns for %s', async (_label, expected) => {
    const { adapter, keyword, embed } = make({ lexical: [], vector: [] });
    keyword.getBody = vi.fn(async () => expected);

    expect(await adapter.getBody('u1', 'n1')).toBe(expected);
    expect(embed.embedQuery).not.toHaveBeenCalled();
  });

  it('lets a keyword read failure surface instead of degrading to the vector leg', async () => {
    const { adapter, keyword, embed } = make({ lexical: [], vector: [] });
    keyword.getBody = vi.fn(async () => {
      throw new Error('note store down');
    });

    await expect(adapter.getBody('u1', 'n1')).rejects.toThrow(
      'note store down'
    );
    expect(embed.embedQuery).not.toHaveBeenCalled();
  });

  it('delegates getById to the keyword adapter, never to the vector leg', async () => {
    const { adapter, keyword, embed } = make({ lexical: [], vector: [] });

    expect(await adapter.getById('u1', 'n1')).toBe(KEYWORD_NOTE);
    expect(keyword.getById).toHaveBeenCalledWith('u1', 'n1');
    expect(embed.embedQuery).not.toHaveBeenCalled();
  });
});
