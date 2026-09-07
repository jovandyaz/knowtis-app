import { describe, expect, it } from 'vitest';

import type {
  DueCardRow,
  FlashcardDeckRow,
  StudyActivity,
} from '../../domain/ports/artifact.repository';
import {
  buildStudyCards,
  pickNewCardRefs,
  toStudyStats,
} from './study-session.builder';

function deck(id: string, cardCount: number, seen: number[]): FlashcardDeckRow {
  return {
    artifactId: id,
    noteId: `note-${id}`,
    deckTitle: `Deck ${id}`,
    bucket: 'resources',
    cards: Array.from({ length: cardCount }, (_, i) => ({
      front: `${id}-front-${i}`,
      back: `${id}-back-${i}`,
      difficulty: 'medium' as const,
    })),
    seenIndexes: seen,
  };
}

function due(id: string, cardIndex: number, intervalDays = 6): DueCardRow {
  return {
    artifactId: id,
    cardIndex,
    noteId: `note-${id}`,
    deckTitle: `Deck ${id}`,
    bucket: null,
    front: `${id}-front-${cardIndex}`,
    back: `${id}-back-${cardIndex}`,
    difficulty: 'hard',
    easeFactor: 2.5,
    intervalDays,
    repetitions: 2,
  };
}

describe('pickNewCardRefs', () => {
  it('takes unseen indexes round-robin across decks up to the limit', () => {
    const refs = pickNewCardRefs(
      [deck('A', 3, [0]), deck('B', 3, []), deck('C', 1, [0])],
      4
    );
    expect(refs.map((r) => `${r.deck.artifactId}:${r.cardIndex}`)).toEqual([
      'A:1',
      'B:0',
      'A:2',
      'B:1',
    ]);
  });

  it('returns every unseen card when there are fewer than the limit', () => {
    const refs = pickNewCardRefs([deck('A', 2, [])], 10);
    expect(refs).toHaveLength(2);
  });
});

describe('buildStudyCards', () => {
  const input = {
    due: [due('A', 0), due('B', 2, 1)],
    decks: [deck('A', 3, [0]), deck('B', 3, [2])],
    seed: 'user-1:2026-09-06',
    dueLimit: 20,
    newLimit: 2,
  };

  it('puts the due block before the new block and caps the new block', () => {
    const cards = buildStudyCards(input);
    expect(cards.map((c) => c.kind)).toEqual(['due', 'due', 'new', 'new']);
  });

  it('is deterministic for the same seed', () => {
    expect(buildStudyCards(input)).toEqual(buildStudyCards(input));
  });

  it('carries deck identity and predicted intervals on every card', () => {
    const cards = buildStudyCards(input);
    expect(cards).not.toHaveLength(0);
    for (const card of cards) {
      expect(card).toEqual(
        expect.objectContaining({
          noteId: expect.stringMatching(/^note-/),
          deckTitle: expect.stringMatching(/^Deck /),
          predictedIntervals: {
            again: 1,
            hard: 1,
            good: expect.any(Number),
            easy: expect.any(Number),
          },
        })
      );
    }
  });

  it('predicts the first SM-2 step for new cards', () => {
    const cards = buildStudyCards(input);
    const fresh = cards.find((c) => c.kind === 'new');
    expect(fresh?.predictedIntervals).toEqual({
      again: 1,
      hard: 1,
      good: 1,
      easy: 1,
    });
  });

  it('respects the due limit', () => {
    const cards = buildStudyCards({ ...input, dueLimit: 1 });
    expect(cards.filter((c) => c.kind === 'due')).toHaveLength(1);
  });
});

describe('toStudyStats', () => {
  const activity: StudyActivity = {
    dueCount: 4,
    newCount: 12,
    totalCardsStudied: 30,
    nextDueAt: new Date('2026-09-07T09:00:00.000Z'),
    activeDays: [
      { day: '2026-09-06', reviews: 7 },
      { day: '2026-09-05', reviews: 3 },
    ],
  };

  it("maps counts, streak and today's reviews", () => {
    expect(toStudyStats(activity, '2026-09-06')).toEqual({
      dueCount: 4,
      newCount: 12,
      reviewedToday: 7,
      currentStreak: 2,
      totalCardsStudied: 30,
      nextDueAt: '2026-09-07T09:00:00.000Z',
    });
  });

  it('reports zero reviews today when today has no activity', () => {
    const stats = toStudyStats(activity, '2026-09-07');
    expect(stats.reviewedToday).toBe(0);
    expect(stats.currentStreak).toBe(2);
  });
});
