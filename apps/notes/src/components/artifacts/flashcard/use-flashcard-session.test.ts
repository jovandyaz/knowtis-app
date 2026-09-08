import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SM2_QUALITY, type StudyCard } from '@knowtis/shared-types';

import { useFlashcardSession } from './use-flashcard-session';

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

    expect(result.current.currentCard).toEqual(cards[2]);
  });

  it('marks the remaining cards skipped when the session is finished early', () => {
    const cards = [makeCard(0), makeCard(1), makeCard(2)];
    const { result } = renderHook(() => useFlashcardSession(cards));

    act(() => result.current.finish());

    expect(result.current.isComplete).toBe(true);
    expect(result.current.cardStatuses).toEqual([
      'skipped',
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

  it('reports a duration that starts at the first render and freezes on completion', () => {
    const cards = [makeCard(0), makeCard(1)];
    const { result } = renderHook(() => useFlashcardSession(cards));

    expect(result.current.sessionResult.durationMs).toBe(0);

    act(() => result.current.rate('correct'));
    act(() => result.current.rate('correct'));

    expect(result.current.isComplete).toBe(true);
    const frozenDuration = result.current.sessionResult.durationMs;
    expect(frozenDuration).toBeGreaterThanOrEqual(0);
    expect(result.current.sessionResult.durationMs).toBe(frozenDuration);
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
      'pending',
    ]);

    const identities = new Set(
      cards.map((c) => `${c.artifactId}:${c.cardIndex}`)
    );
    const activeIdentities = Array.from(
      { length: result.current.totalCards },
      (_, i) => i
    ).map((i) => {
      act(() => result.current.navigate(i));
      const card = result.current.currentCard as StudyCard;
      return `${card.artifactId}:${card.cardIndex}`;
    });

    expect(new Set(activeIdentities)).toEqual(identities);
    expect(activeIdentities).toHaveLength(cards.length);
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
