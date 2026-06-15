import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { EmbeddingPort } from '../../../ai/domain/ports/embedding.port';
import type { NoteReadRepository } from '../../../notes/domain/ports/note-read.repository';
import { HybridRetrievalAdapter } from './hybrid-retrieval.adapter';
import { KeywordRetrievalAdapter } from './keyword-retrieval.adapter';

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
}) {
  const repo = {
    findAccessibleNotesByLexicalRank: vi.fn(async () =>
      opts.lexical.map(summary)
    ),
    findAccessibleNotesByEmbedding: vi.fn(async () => opts.vector.map(summary)),
  } as unknown as NoteReadRepository;
  const embed = {
    embedQuery: vi.fn(async () => {
      if (opts.embedThrows) {
        throw new Error('voyage down');
      }
      return new Array(1024).fill(0);
    }),
    embedDocuments: vi.fn(),
  } as unknown as EmbeddingPort;
  const keyword = {
    search: vi.fn(async () => [] as never),
    getById: vi.fn(),
    listRecent: vi.fn(),
    overview: vi.fn(),
  } as unknown as KeywordRetrievalAdapter;
  const config = {
    get: () => 'voyage-4',
  } as unknown as ConfigService<Record<string, unknown>, true>;
  return {
    adapter: new HybridRetrievalAdapter(repo, embed, keyword, config),
    repo,
    embed,
  };
}

describe('HybridRetrievalAdapter.search', () => {
  it('fuses both legs (note in both legs ranks first)', async () => {
    const { adapter } = make({ lexical: ['a', 'b'], vector: ['b', 'c'] });
    const hits = await adapter.search('u1', 'q');
    expect(hits[0].id).toBe('b');
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
});
