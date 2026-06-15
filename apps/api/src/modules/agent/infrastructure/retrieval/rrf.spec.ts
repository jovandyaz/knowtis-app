import { describe, expect, it } from 'vitest';

import type { NoteHit } from '../../domain/retrieval';
import { reciprocalRankFusion } from './rrf';

function hit(id: string): NoteHit {
  return {
    id,
    title: id,
    updatedAt: '2026-06-01T00:00:00.000Z',
    isOwner: true,
    isSharedWithMe: false,
    isPubliclyShared: false,
  };
}

describe('reciprocalRankFusion', () => {
  it('boosts a note that appears in both lists above singletons', () => {
    const lexical = [hit('a'), hit('b')];
    const vector = [hit('b'), hit('c')];

    const fused = reciprocalRankFusion([lexical, vector], 10);

    expect(fused[0].id).toBe('b');
    expect(fused.map((h) => h.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('dedupes by id and never returns duplicates', () => {
    const fused = reciprocalRankFusion([[hit('a')], [hit('a')]], 10);
    expect(fused).toHaveLength(1);
    expect(fused[0].id).toBe('a');
  });

  it('caps the result at limit', () => {
    const list = [hit('a'), hit('b'), hit('c'), hit('d')];
    const fused = reciprocalRankFusion([list], 10, 2);
    expect(fused).toHaveLength(2);
  });

  it('returns [] for empty input', () => {
    expect(reciprocalRankFusion([], 10)).toEqual([]);
    expect(reciprocalRankFusion([[], []], 10)).toEqual([]);
  });
});
