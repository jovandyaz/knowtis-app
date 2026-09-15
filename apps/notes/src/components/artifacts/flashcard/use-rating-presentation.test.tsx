import { act, renderHook } from '@testing-library/react';
import type * as MotionReact from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SM2_QUALITY, type StudyCard } from '@knowtis/shared-types';

import { useFlashcardSession } from './use-flashcard-session';
import { useRatingPresentation } from './use-rating-presentation';

const reducedMotion = { value: false };
vi.mock('motion/react', async () => {
  const actual = await vi.importActual<typeof MotionReact>('motion/react');
  return { ...actual, useReducedMotion: () => reducedMotion.value };
});

const cards: StudyCard[] = [0, 1].map((cardIndex) => ({
  artifactId: 'deck',
  cardIndex,
  noteId: 'note',
  deckTitle: 'Deck',
  bucket: null,
  front: `Front ${cardIndex}`,
  back: `Back ${cardIndex}`,
  difficulty: 'medium',
  kind: 'new',
  predictedIntervals: { again: 1, hard: 1, good: 1, easy: 1 },
}));

function renderPresentation(readOnly = false) {
  const saved = Promise.withResolvers<undefined>();
  const reviewCard = vi.fn(() => saved.promise);
  const onCommitted = vi.fn();
  const onError = vi.fn();
  const hook = renderHook(() => {
    const session = useFlashcardSession(cards);
    const rating = useRatingPresentation({
      artifactId: 'deck',
      session,
      readOnly,
      reviewCard,
      onCommitted,
      onError,
    });
    return { session, rating };
  });
  return { ...hook, saved, reviewCard, onCommitted, onError };
}

describe('useRatingPresentation', () => {
  beforeEach(() => {
    reducedMotion.value = false;
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('shows the provisional stamp while saving without settling the track', () => {
    const { result, reviewCard } = renderPresentation();

    act(() => {
      void result.current.rating.begin(SM2_QUALITY.GOOD, 'correct');
    });

    expect(result.current.rating.presentation?.phase).toBe('saving');
    expect(result.current.rating.card.verdict).toBe('correct');
    expect(result.current.rating.segments).toEqual(['current', 'pending']);
    expect(result.current.rating.isLocked()).toBe(true);
    expect(result.current.session.cardStatuses).toEqual(['pending', 'pending']);
    expect(reviewCard).toHaveBeenCalledExactlyOnceWith({
      artifactId: 'deck',
      cardIndex: 0,
      quality: SM2_QUALITY.GOOD,
    });
  });

  it('starts departure only after acceptance and advances only after departure', async () => {
    const { result, saved, onCommitted } = renderPresentation();
    act(() => {
      void result.current.rating.begin(SM2_QUALITY.AGAIN, 'wrong');
    });
    act(() => result.current.rating.onCardAnimationComplete());
    expect(result.current.rating.presentation?.phase).toBe('saving');
    expect(result.current.session.currentIndex).toBe(0);

    await act(async () => saved.resolve(undefined));
    expect(result.current.rating.presentation?.phase).toBe('exiting');
    expect(result.current.rating.segments).toEqual(['wrong', 'pending']);
    expect(result.current.session.cardStatuses).toEqual(['pending', 'pending']);
    const outgoingComplete = result.current.rating.onCardAnimationComplete;
    act(() => outgoingComplete());
    expect(result.current.session.currentIndex).toBe(1);
    expect(result.current.session.cardStatuses).toEqual(['wrong', 'pending']);
    expect(result.current.rating.isLocked()).toBe(true);
    act(() => outgoingComplete());
    expect(onCommitted).toHaveBeenCalledExactlyOnceWith(SM2_QUALITY.AGAIN);
  });

  it('clears provisional feedback and unlocks after a rejected save', async () => {
    const { result, saved, onError, onCommitted } = renderPresentation();
    act(() => {
      void result.current.rating.begin(SM2_QUALITY.GOOD, 'correct');
    });
    await act(async () => saved.reject(new Error('Rejected')));

    expect(result.current.rating.presentation).toBeNull();
    expect(result.current.rating.card.verdict).toBeUndefined();
    expect(result.current.rating.isLocked()).toBe(false);
    expect(result.current.rating.segments).toEqual(['current', 'pending']);
    expect(result.current.session.cardStatuses).toEqual(['pending', 'pending']);
    expect(onError).toHaveBeenCalledOnce();
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it('ignores a stale save completion after the card identity changes', async () => {
    const { result, saved, onCommitted } = renderPresentation();
    act(() => {
      void result.current.rating.begin(SM2_QUALITY.GOOD, 'correct');
    });
    const staleComplete = result.current.rating.onCardAnimationComplete;
    act(() => result.current.session.navigate(1));
    await act(async () => saved.resolve(undefined));
    act(() => staleComplete());

    expect(result.current.session.currentIndex).toBe(1);
    expect(result.current.session.cardStatuses).toEqual(['pending', 'pending']);
    expect(result.current.rating.presentation).toBeNull();
    expect(result.current.rating.isLocked()).toBe(false);
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it('ignores a stale departure completion after the card identity changes', async () => {
    const { result, saved, onCommitted } = renderPresentation();
    act(() => {
      void result.current.rating.begin(SM2_QUALITY.GOOD, 'correct');
    });
    await act(async () => saved.resolve(undefined));
    const staleComplete = result.current.rating.onCardAnimationComplete;
    act(() => result.current.session.navigate(1));
    act(() => staleComplete());

    expect(result.current.session.cardStatuses).toEqual(['pending', 'pending']);
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it('commits a local reduced-motion rating synchronously without waiting for animation', () => {
    reducedMotion.value = true;
    const { result, onCommitted, reviewCard } = renderPresentation(true);
    act(() => {
      void result.current.rating.begin(SM2_QUALITY.GOOD, 'correct');
      expect(onCommitted).toHaveBeenCalledExactlyOnceWith(SM2_QUALITY.GOOD);
    });

    expect(result.current.session.currentIndex).toBe(1);
    expect(result.current.session.cardStatuses).toEqual(['correct', 'pending']);
    expect(result.current.rating.card.motion.initial).toBe(false);
    expect(result.current.rating.card.motion.animate).toEqual({
      opacity: 1,
      x: 0,
    });
    expect(reviewCard).not.toHaveBeenCalled();
  });

  it('focuses the mounted incoming card and releases the lock after its animation', async () => {
    const { result, saved } = renderPresentation();
    act(() => {
      void result.current.rating.begin(SM2_QUALITY.GOOD, 'correct');
    });
    await act(async () => saved.resolve(undefined));
    const outgoingRef = result.current.rating.cardRef;
    act(() => result.current.rating.onCardAnimationComplete());
    const incoming = document.createElement('button');
    document.body.append(incoming);
    act(() => result.current.rating.cardRef(incoming));
    act(() => outgoingRef(null));
    expect(incoming).not.toHaveFocus();
    expect(result.current.rating.isLocked()).toBe(true);
    act(() => result.current.rating.onCardAnimationComplete());
    expect(incoming).toHaveFocus();
    expect(result.current.rating.presentation).toBeNull();
    expect(result.current.rating.isLocked()).toBe(false);
  });

  it('locks duplicate actions and run resets until the final card is committed', async () => {
    const { result, saved, reviewCard } = renderPresentation();
    act(() => result.current.session.navigate(1));
    act(() => result.current.session.skip());
    act(() => {
      void result.current.rating.begin(SM2_QUALITY.GOOD, 'correct');
      void result.current.rating.begin(SM2_QUALITY.AGAIN, 'wrong');
      expect(result.current.rating.reset()).toBe(false);
    });
    expect(result.current.rating.runKey).toBe(0);
    expect(reviewCard).toHaveBeenCalledOnce();
    await act(async () => saved.resolve(undefined));
    act(() => result.current.rating.onCardAnimationComplete());
    expect(result.current.session.isComplete).toBe(true);
    expect(result.current.rating.presentation).toBeNull();
    expect(result.current.rating.isLocked()).toBe(false);
    act(() => {
      expect(result.current.rating.reset()).toBe(true);
    });
    expect(result.current.rating.runKey).toBe(1);
  });

  it('ignores acceptance after unmount', async () => {
    const { result, saved, unmount, onCommitted } = renderPresentation();
    act(() => {
      void result.current.rating.begin(SM2_QUALITY.GOOD, 'correct');
    });
    unmount();
    await act(async () => saved.resolve(undefined));
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it('guards session actions during saving and allows them after rejection', async () => {
    const { result, saved } = renderPresentation();
    act(() => {
      void result.current.rating.begin(SM2_QUALITY.GOOD, 'correct');
    });
    act(() => {
      const { actions } = result.current.rating;
      actions.navigate(1);
      actions.flip();
      actions.continue();
      actions.restart();
      actions.reviewSkipped();
    });
    expect(result.current.session.currentIndex).toBe(0);
    expect(result.current.session.flipped).toBe(false);
    expect(result.current.rating.runKey).toBe(0);
    expect(result.current.rating.presentation?.phase).toBe('saving');

    await act(async () => saved.reject(new Error('Rejected')));
    act(() => result.current.rating.actions.navigate(1));
    act(() => result.current.rating.actions.flip());
    expect(result.current.session.currentIndex).toBe(1);
    expect(result.current.session.flipped).toBe(true);
  });
});
