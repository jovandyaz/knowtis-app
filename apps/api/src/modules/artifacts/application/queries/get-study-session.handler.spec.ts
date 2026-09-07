import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DUE_CARDS_PER_SESSION,
  type FlashcardProgressRepository,
} from '../../domain/ports/artifact.repository';
import { GetStudySessionHandler } from './get-study-session.handler';

describe('GetStudySessionHandler', () => {
  let findDueCards: ReturnType<typeof vi.fn>;
  let findFlashcardDecks: ReturnType<typeof vi.fn>;
  let getStudyActivity: ReturnType<typeof vi.fn>;
  let handler: GetStudySessionHandler;

  beforeEach(() => {
    findDueCards = vi.fn().mockResolvedValue([]);
    findFlashcardDecks = vi.fn().mockResolvedValue([
      {
        artifactId: 'deck-1',
        noteId: 'note-1',
        deckTitle: 'Deck',
        bucket: null,
        cards: [{ front: 'f', back: 'b', difficulty: 'easy' }],
        seenIndexes: [],
      },
    ]);
    getStudyActivity = vi.fn().mockResolvedValue({
      dueCount: 0,
      newCount: 1,
      totalCardsStudied: 0,
      nextDueAt: null,
      activeDays: [],
    });
    handler = new GetStudySessionHandler({
      findDueCards,
      findFlashcardDecks,
      getStudyActivity,
    } as unknown as FlashcardProgressRepository);
  });

  it("assembles cards and stats with the caller's time zone", async () => {
    const session = await handler.execute({
      userId: 'user-1',
      timeZone: 'America/Mexico_City',
    });

    expect(findDueCards).toHaveBeenCalledWith('user-1', DUE_CARDS_PER_SESSION);
    expect(getStudyActivity).toHaveBeenCalledWith(
      'user-1',
      'America/Mexico_City'
    );
    expect(session.cards).toHaveLength(1);
    expect(session.cards[0]?.kind).toBe('new');
    expect(session.stats.newCount).toBe(1);
  });

  it('returns an empty session when the user has no decks', async () => {
    findFlashcardDecks.mockResolvedValue([]);
    getStudyActivity.mockResolvedValue({
      dueCount: 0,
      newCount: 0,
      totalCardsStudied: 0,
      nextDueAt: null,
      activeDays: [],
    });

    const session = await handler.execute({
      userId: 'user-1',
      timeZone: 'UTC',
    });

    expect(session.cards).toEqual([]);
    expect(session.stats).toEqual({
      dueCount: 0,
      newCount: 0,
      reviewedToday: 0,
      currentStreak: 0,
      totalCardsStudied: 0,
      nextDueAt: null,
    });
  });
});
