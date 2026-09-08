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

function reverse<T>(items: T[]): T[] {
  return [...items].reverse();
}

describe('useFlashcardSession', () => {
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

  it('marks the remaining cards skipped when the session is finished early', () => {
    const cards = [makeCard(0), makeCard(1), makeCard(2)];
    const { result } = renderHook(() => useFlashcardSession(cards));

    act(() => result.current.rate('correct'));
    act(() => result.current.finish());

    expect(result.current.isComplete).toBe(true);
    expect(result.current.cardStatuses).toEqual([
      'correct',
      'skipped',
      'skipped',
    ]);
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

  it('reports a duration that starts at the first render, freezes on completion, and restarts fresh', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const cards = [makeCard(0), makeCard(1)];
    const { result, rerender } = renderHook(() => useFlashcardSession(cards));

    vi.setSystemTime(5_000);
    act(() => result.current.rate('correct'));
    act(() => result.current.rate('correct'));

    expect(result.current.isComplete).toBe(true);
    expect(result.current.sessionResult.durationMs).toBe(5_000);

    vi.setSystemTime(9_000);
    rerender();
    expect(result.current.sessionResult.durationMs).toBe(5_000);

    vi.setSystemTime(9_500);
    act(() => result.current.restart());
    expect(result.current.sessionResult.durationMs).toBe(0);

    vi.setSystemTime(11_500);
    act(() => result.current.rate('correct'));
    act(() => result.current.rate('correct'));
    expect(result.current.sessionResult.durationMs).toBe(2_000);
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

  it('rateAdvanced maps SM2 quality to correct/wrong', () => {
    const cards = [makeCard(0), makeCard(1)];
    const { result } = renderHook(() => useFlashcardSession(cards));

    act(() => result.current.rateAdvanced(SM2_QUALITY.AGAIN));
    expect(result.current.counts.wrong).toBe(1);

    act(() => result.current.rateAdvanced(SM2_QUALITY.EASY));
    expect(result.current.counts.correct).toBe(1);
  });
});
