import { describe, expect, it } from 'vitest';

import type {
  FlashcardArtifact,
  FlashcardProgress,
} from '@knowtis/shared-types';

import { deckStudyCards } from './deck-study-cards';

const artifact: FlashcardArtifact = {
  id: 'deck-1',
  userId: 'user-1',
  sourceNoteId: 'note-1',
  title: 'Spanish verbs',
  type: 'flashcard_deck',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  content: {
    cards: [
      { front: 'Front zero', back: 'Back zero', difficulty: 'easy' },
      { front: 'Front one', back: 'Back one', difficulty: 'medium' },
      { front: 'Front two', back: 'Back two', difficulty: 'hard' },
    ],
  },
};

function makeProgress(cardIndex: number): FlashcardProgress {
  return {
    artifactId: artifact.id,
    cardIndex,
    easeFactor: 2.5,
    intervalDays: 3,
    repetitions: 1,
    nextReview: '2026-09-09T00:00:00.000Z',
  };
}

describe('deckStudyCards', () => {
  it('marks cards with progress as due and the rest as new', () => {
    const cards = deckStudyCards(artifact, [makeProgress(0), makeProgress(2)]);

    expect(cards.map((c) => c.kind)).toEqual(['due', 'new', 'due']);
  });

  it('indexes each card by its position in artifact.content.cards', () => {
    const cards = deckStudyCards(artifact, undefined);

    expect(cards.map((c) => c.cardIndex)).toEqual([0, 1, 2]);
  });

  it('carries the artifact identity onto every card', () => {
    const cards = deckStudyCards(artifact, undefined);

    for (const card of cards) {
      expect(card.artifactId).toBe('deck-1');
      expect(card.noteId).toBe('note-1');
      expect(card.deckTitle).toBe('Spanish verbs');
    }
  });

  it('has no bucket context in a deck viewer', () => {
    const cards = deckStudyCards(artifact, undefined);

    for (const card of cards) {
      expect(card.bucket).toBeNull();
    }
  });

  it('predicts neutral intervals until the server sends per-card values', () => {
    const cards = deckStudyCards(artifact, undefined);

    for (const card of cards) {
      expect(card.predictedIntervals).toEqual({
        again: 1,
        hard: 1,
        good: 1,
        easy: 1,
      });
    }
  });

  it('treats an undefined progress list as no cards due', () => {
    const cards = deckStudyCards(artifact, undefined);

    expect(cards.every((c) => c.kind === 'new')).toBe(true);
  });
});
