import type { NoteHit } from '../../domain/retrieval';

const DEFAULT_K = 60;
const DEFAULT_LIMIT = 20;

/**
 * Fuses ranked NoteHit lists with Reciprocal Rank Fusion
 * (score = Σ 1/(k + rank), 1-based rank), dedups by id, returns the top `limit`.
 */
export function reciprocalRankFusion(
  rankedLists: NoteHit[][],
  k: number = DEFAULT_K,
  limit: number = DEFAULT_LIMIT
): NoteHit[] {
  const scores = new Map<string, number>();
  const hits = new Map<string, NoteHit>();

  for (const list of rankedLists) {
    list.forEach((hit, index) => {
      const rank = index + 1;
      scores.set(hit.id, (scores.get(hit.id) ?? 0) + 1 / (k + rank));
      if (!hits.has(hit.id)) {
        hits.set(hit.id, hit);
      }
    });
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => hits.get(id) as NoteHit);
}
