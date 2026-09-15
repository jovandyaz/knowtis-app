import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SM2_QUALITY, type StudyCard } from '@knowtis/shared-types';

import { useFlashcardSession } from './use-flashcard-session';

function assertDefined<T>(value: T | undefined): asserts value is T {
  expect(value).toBeDefined();
}

function makeCard(i: number): StudyCard {
  return {
    artifactId: `artifact-${i}`,
    cardIndex: i,
    noteId: `note-${i}`,
    deckTitle: `Deck ${i}`,
    bucket: null,
    front: `Front ${i}`,
    back: `Back ${i}`,
    difficulty: 'medium',
    kind: 'due',
    predictedIntervals: { again: 1, hard: 1, good: 1, easy: 1 },
  };
}

const SESSION_EPOCH_MS = Date.UTC(2026, 0, 1);

function reverse<T>(items: T[]): T[] {
  return [...items].reverse();
}

describe('useFlashcardSession', () => {
  it.each(['simple', 'advanced'])(
    'returns false for a stale %s rating after shuffle changes the current card',
    async (mode) => {
      const cards = [makeCard(0), makeCard(1)];
      const { result } = renderHook(() => useFlashcardSession(cards, reverse));
      const saved = Promise.withResolvers<undefined>();
      const rate = result.current.rate;
      const rateAdvanced = result.current.rateAdvanced;
      const pending = saved.promise.then(() =>
        mode === 'simple'
          ? rate('correct', 'artifact-0:0')
          : rateAdvanced(SM2_QUALITY.GOOD, 'artifact-0:0')
      );
      act(() => result.current.shuffle());
      await act(async () => {
        saved.resolve(undefined);
        expect(await pending).toBe(false);
      });
      expect(result.current.currentCard).toEqual(cards[1]);
      expect(result.current.cardStatuses).toEqual(['pending', 'pending']);
      expect(result.current.ratings).toEqual([null, null]);
    }
  );

  it.each(['simple', 'advanced'])(
    'returns true when a %s rating is applied to the current card',
    (mode) => {
      const { result } = renderHook(() =>
        useFlashcardSession([makeCard(0), makeCard(1)])
      );
      act(() => {
        const applied =
          mode === 'simple'
            ? result.current.rate('correct')
            : result.current.rateAdvanced(SM2_QUALITY.GOOD);
        expect(applied).toBe(true);
      });
      expect(result.current.counts.correct).toBe(1);
      expect(result.current.currentCard?.cardIndex).toBe(1);
    }
  );

  it('returns a revisited skipped card to pending so it can be graded', () => {
    const { result } = renderHook(() =>
      useFlashcardSession([makeCard(0), makeCard(1)])
    );
    act(() => result.current.skip());
    act(() => result.current.navigate(0));
    act(() => result.current.flip());
    act(() => result.current.reviewSkipped());
    expect(result.current.cardStatuses).toEqual(['pending', 'pending']);
    expect(result.current.counts.skipped).toBe(0);
    expect(result.current.ratings[0]).toBeNull();
    expect(result.current.flipped).toBe(true);
    act(() => result.current.rate('correct'));
    expect(result.current.counts.correct).toBe(1);
  });

  it('does not reopen a rated card through Review skipped', () => {
    const { result } = renderHook(() =>
      useFlashcardSession([makeCard(0), makeCard(1)])
    );
    act(() => result.current.rate('correct'));
    act(() => result.current.navigate(0));
    act(() => result.current.reviewSkipped());
    expect(result.current.cardStatuses[0]).toBe('correct');
    expect(result.current.ratings[0]).toBe(SM2_QUALITY.GOOD);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts on the first card, unflipped, incomplete', () => {
    const cards = [makeCard(0), makeCard(1)];
    const { result } = renderHook(() => useFlashcardSession(cards));

    expect(result.current.currentIndex).toBe(0);
    expect(result.current.flipped).toBe(false);
    expect(result.current.isComplete).toBe(false);
    expect(result.current.currentCard).toEqual(cards[0]);
  });

  it('flips and rates, advancing to the next pending card', () => {
    const cards = [makeCard(0), makeCard(1), makeCard(2)];
    const { result } = renderHook(() => useFlashcardSession(cards));

    act(() => result.current.flip());
    expect(result.current.flipped).toBe(true);

    act(() => result.current.rate('correct'));
    expect(result.current.flipped).toBe(false);
    expect(result.current.currentIndex).toBe(1);
    expect(result.current.counts.correct).toBe(1);
  });

  it('keeps each card reachable by its own artifactId and cardIndex after a shuffle', () => {
    const cards = [makeCard(0), makeCard(1), makeCard(2)];
    const { result } = renderHook(() => useFlashcardSession(cards, reverse));

    act(() => result.current.shuffle());

    expect(result.current.currentCard?.artifactId).toBe(cards[2].artifactId);
    expect(result.current.currentCard?.cardIndex).toBe(cards[2].cardIndex);
  });

  it('completes once every card is rated or skipped, without an explicit finish', () => {
    const cards = [makeCard(0), makeCard(1)];
    const { result } = renderHook(() => useFlashcardSession(cards));

    act(() => result.current.rate('correct'));
    act(() => result.current.skip());

    expect(result.current.isComplete).toBe(true);
    expect(result.current.cardStatuses).toEqual(['correct', 'skipped']);
    expect(result.current).not.toHaveProperty('finish');
  });

  it("keeps a rated card's status and rating when browsed back to", () => {
    const cards = [makeCard(0), makeCard(1)];
    const { result } = renderHook(() => useFlashcardSession(cards));

    act(() => result.current.rateAdvanced(SM2_QUALITY.HARD));
    act(() => result.current.navigate(0));

    expect(result.current.currentIndex).toBe(0);
    expect(result.current.cardStatuses[0]).toBe('wrong');
    expect(result.current.ratings[0]).toBe(SM2_QUALITY.HARD);
  });

  it('records a simple rating as the SM-2 quality it submits', () => {
    const cards = [makeCard(0), makeCard(1)];
    const { result } = renderHook(() => useFlashcardSession(cards));

    act(() => result.current.rate('wrong'));
    act(() => result.current.rate('correct'));

    expect(result.current.ratings).toEqual([
      SM2_QUALITY.AGAIN,
      SM2_QUALITY.GOOD,
    ]);
  });

  it('keeps each rating with its own card through a shuffle', () => {
    const cards = [makeCard(0), makeCard(1), makeCard(2)];
    const { result } = renderHook(() => useFlashcardSession(cards, reverse));

    act(() => result.current.rateAdvanced(SM2_QUALITY.EASY));
    act(() => result.current.shuffle());

    expect(result.current.ratings).toEqual([null, null, SM2_QUALITY.EASY]);
  });

  it('clears the ratings when the session restarts', () => {
    const cards = [makeCard(0), makeCard(1)];
    const { result } = renderHook(() => useFlashcardSession(cards));

    act(() => result.current.rate('wrong'));
    act(() => result.current.rate('correct'));
    act(() => result.current.restart('missed'));

    expect(result.current.ratings).toEqual([null]);
  });

  it('leaves every status untouched when browsing', () => {
    const cards = [makeCard(0), makeCard(1), makeCard(2)];
    const { result } = renderHook(() => useFlashcardSession(cards));

    act(() => result.current.rate('correct'));
    act(() => result.current.navigate(2));
    act(() => result.current.navigate(0));

    expect(result.current.cardStatuses).toEqual([
      'correct',
      'pending',
      'pending',
    ]);
    expect(result.current.flipped).toBe(false);
  });

  it('restarts with only the missed cards', () => {
    const cards = [makeCard(0), makeCard(1), makeCard(2)];
    const { result } = renderHook(() => useFlashcardSession(cards));

    act(() => result.current.rate('wrong'));
    act(() => result.current.rate('correct'));
    act(() => result.current.rate('correct'));
    expect(result.current.isComplete).toBe(true);

    act(() => result.current.restart('missed'));

    expect(result.current.isComplete).toBe(false);
    expect(result.current.totalCards).toBe(1);
    expect(result.current.currentCard).toEqual(cards[0]);
  });

  it('keeps a shuffle inside a filtered restart within the filtered cards', () => {
    const cards = [makeCard(0), makeCard(1), makeCard(2)];
    const { result } = renderHook(() => useFlashcardSession(cards, reverse));

    act(() => result.current.rate('wrong'));
    act(() => result.current.rate('correct'));
    act(() => result.current.rate('correct'));

    act(() => result.current.restart('missed'));
    expect(result.current.totalCards).toBe(1);

    act(() => result.current.shuffle());

    expect(result.current.totalCards).toBe(1);
    expect(result.current.currentCard?.artifactId).toBe(cards[0].artifactId);
    expect(result.current.currentCard?.cardIndex).toBe(cards[0].cardIndex);
  });

  it("pairs a second filtered restart with each card's own status", () => {
    const cards = [makeCard(0), makeCard(1), makeCard(2)];
    const { result } = renderHook(() => useFlashcardSession(cards));

    act(() => result.current.rate('correct'));
    act(() => result.current.rate('wrong'));
    act(() => result.current.rate('correct'));

    act(() => result.current.restart('missed'));
    expect(result.current.currentCard?.artifactId).toBe(cards[1].artifactId);

    act(() => result.current.rate('wrong'));
    act(() => result.current.restart('missed'));

    expect(result.current.totalCards).toBe(1);
    expect(result.current.currentCard?.artifactId).toBe(cards[1].artifactId);
    expect(result.current.currentCard?.cardIndex).toBe(cards[1].cardIndex);
  });

  it('reports no elapsed time until the deck ends, then the wall time it took', () => {
    vi.useFakeTimers();
    vi.setSystemTime(SESSION_EPOCH_MS);

    const cards = [makeCard(0), makeCard(1)];
    const { result } = renderHook(() => useFlashcardSession(cards));

    expect(result.current.sessionResult.durationMs).toBe(0);

    vi.setSystemTime(SESSION_EPOCH_MS + 5_000);
    act(() => result.current.rate('correct'));
    expect(result.current.sessionResult.durationMs).toBe(0);

    act(() => result.current.rate('correct'));
    expect(result.current.isComplete).toBe(true);
    expect(result.current.sessionResult.durationMs).toBe(5_000);
  });

  it('restarts the clock from zero and measures the replay on its own', () => {
    vi.useFakeTimers();
    vi.setSystemTime(SESSION_EPOCH_MS);

    const cards = [makeCard(0), makeCard(1)];
    const { result } = renderHook(() => useFlashcardSession(cards));

    vi.setSystemTime(SESSION_EPOCH_MS + 5_000);
    act(() => result.current.rate('correct'));
    act(() => result.current.rate('correct'));

    vi.setSystemTime(SESSION_EPOCH_MS + 9_500);
    act(() => result.current.restart());
    expect(result.current.sessionResult.durationMs).toBe(0);

    vi.setSystemTime(SESSION_EPOCH_MS + 11_500);
    act(() => result.current.rate('correct'));
    act(() => result.current.rate('correct'));
    expect(result.current.sessionResult.durationMs).toBe(2_000);
  });

  it('stamps the duration once the deck ends and never re-stamps it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(SESSION_EPOCH_MS);

    const cards = [makeCard(0), makeCard(1)];
    const { result } = renderHook(() => useFlashcardSession(cards));

    vi.setSystemTime(SESSION_EPOCH_MS + 5_000);
    act(() => result.current.rate('correct'));
    act(() => result.current.rate('correct'));
    expect(result.current.sessionResult.durationMs).toBe(5_000);

    vi.setSystemTime(SESSION_EPOCH_MS + 60_000);
    act(() => result.current.skip());
    expect(result.current.sessionResult.durationMs).toBe(5_000);

    act(() => result.current.rate('correct'));
    expect(result.current.sessionResult.durationMs).toBe(5_000);
  });

  it('shuffles without losing or duplicating a card', () => {
    const cards = [makeCard(0), makeCard(1), makeCard(2)];
    const { result } = renderHook(() => useFlashcardSession(cards, reverse));

    act(() => result.current.rate('correct'));
    act(() => result.current.shuffle());

    expect(result.current.currentIndex).toBe(0);
    expect(result.current.cardStatuses).toEqual([
      'pending',
      'pending',
      'correct',
    ]);

    const identities = new Set(
      cards.map((c) => `${c.artifactId}:${c.cardIndex}`)
    );
    const activeIdentities = Array.from(
      { length: result.current.totalCards },
      (_, i) => i
    ).map((i) => {
      act(() => result.current.navigate(i));
      const card = result.current.currentCard;
      assertDefined(card);
      return `${card.artifactId}:${card.cardIndex}`;
    });

    expect(new Set(activeIdentities)).toEqual(identities);
    expect(activeIdentities).toHaveLength(cards.length);
  });

  it('gives each card result its own artifactId and deck cardIndex, not its session position', () => {
    const cards = [makeCard(5), makeCard(2)];
    const { result } = renderHook(() => useFlashcardSession(cards, reverse));

    act(() => result.current.shuffle());
    act(() => result.current.rate('correct'));
    act(() => result.current.rate('correct'));

    expect(result.current.sessionResult.cardResults).toEqual([
      expect.objectContaining({ artifactId: 'artifact-2', cardIndex: 2 }),
      expect.objectContaining({ artifactId: 'artifact-5', cardIndex: 5 }),
    ]);
  });

  it('comes back to a card the cursor was moved past instead of stranding it', () => {
    const cards = [makeCard(0), makeCard(1)];
    const { result } = renderHook(() => useFlashcardSession(cards));

    act(() => result.current.navigate(1));
    act(() => result.current.rate('correct'));

    expect(result.current.currentIndex).toBe(0);
    expect(result.current.currentCard).toEqual(cards[0]);
    expect(result.current.isComplete).toBe(false);

    act(() => result.current.rate('correct'));

    expect(result.current.isComplete).toBe(true);
    expect(result.current.counts.correct).toBe(2);
  });

  it('rateAdvanced maps SM2 quality to correct/wrong', () => {
    const cards = [makeCard(0), makeCard(1)];
    const { result } = renderHook(() => useFlashcardSession(cards));

    act(() => result.current.rateAdvanced(SM2_QUALITY.AGAIN));
    expect(result.current.counts.wrong).toBe(1);

    act(() => result.current.rateAdvanced(SM2_QUALITY.EASY));
    expect(result.current.counts.correct).toBe(1);
  });
});
