import type { ReactNode } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SM2_QUALITY,
  type StudyCard,
  type StudySession,
} from '@knowtis/shared-types';

import { resolveStudyKeyAction, StudySessionPage } from './StudySessionPage';

const { reviewCard } = vi.hoisted(() => ({
  reviewCard: vi.fn(),
}));

let sessionQuery: {
  data: StudySession | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key} ${JSON.stringify(opts)}` : key,
    i18n: { language: 'es' },
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  Navigate: () => null,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('motion/react', async () => {
  const actual = await vi.importActual('motion/react');
  return { ...actual, useReducedMotion: () => true };
});
vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlags: () => ({ isPending: false }),
  useFeatureFlag: () => true,
}));
vi.mock('@knowtis/data-access-artifacts', () => ({
  useStudySession: () => sessionQuery,
  useStudyStats: () => ({ data: undefined }),
  useReviewCard: () => ({ mutateAsync: reviewCard, isPending: false }),
}));

function makeCard(overrides: Partial<StudyCard> = {}): StudyCard {
  return {
    artifactId: 'deck-1',
    cardIndex: 0,
    noteId: 'note-1',
    deckTitle: 'Biología',
    bucket: 'areas',
    front: 'Frente uno',
    back: 'Dorso uno',
    difficulty: 'easy',
    kind: 'due',
    predictedIntervals: { again: 1, hard: 2, good: 4, easy: 8 },
    ...overrides,
  };
}

const CARD_ONE = makeCard();
const CARD_TWO = makeCard({
  cardIndex: 1,
  front: 'Frente dos',
  back: 'Dorso dos',
  deckTitle: 'Historia',
});

function queueOf(cards: StudyCard[]) {
  sessionQuery = {
    data: {
      cards,
      stats: {
        dueCount: cards.length,
        newCount: 0,
        reviewedToday: 0,
        currentStreak: 0,
        totalCardsStudied: 0,
        nextDueAt: null,
      },
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
}

function front(text: RegExp) {
  return screen.getByRole('button', { name: text });
}

function correctButton() {
  return screen.queryByRole('button', {
    name: 'ai.artifacts.flashcards.correct',
  });
}

function pageRoot(container: HTMLElement) {
  return container.firstElementChild as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  reviewCard.mockResolvedValue({ ok: true });
  queueOf([CARD_ONE, CARD_TWO]);
});

describe('resolveStudyKeyAction', () => {
  it('flips on Space and Enter in both modes', () => {
    for (const key of [' ', 'Enter']) {
      expect(resolveStudyKeyAction(key, false)).toEqual({ type: 'flip' });
      expect(resolveStudyKeyAction(key, true)).toEqual({ type: 'flip' });
    }
  });

  it('navigates with the arrow keys in both modes', () => {
    for (const isAdvancedMode of [false, true]) {
      expect(resolveStudyKeyAction('ArrowLeft', isAdvancedMode)).toEqual({
        type: 'navigate',
        direction: -1,
      });
      expect(resolveStudyKeyAction('ArrowRight', isAdvancedMode)).toEqual({
        type: 'navigate',
        direction: 1,
      });
    }
  });

  it('maps 1/2 to wrong/correct in simple mode', () => {
    expect(resolveStudyKeyAction('1', false)).toEqual({
      type: 'rate',
      quality: SM2_QUALITY.AGAIN,
    });
    expect(resolveStudyKeyAction('2', false)).toEqual({
      type: 'rate',
      quality: SM2_QUALITY.GOOD,
    });
  });

  it('ignores 3 and 4 in simple mode', () => {
    expect(resolveStudyKeyAction('3', false)).toBeUndefined();
    expect(resolveStudyKeyAction('4', false)).toBeUndefined();
  });

  it('maps 1-4 to Again/Hard/Good/Easy in advanced mode', () => {
    expect(resolveStudyKeyAction('1', true)).toEqual({
      type: 'rate',
      quality: SM2_QUALITY.AGAIN,
    });
    expect(resolveStudyKeyAction('2', true)).toEqual({
      type: 'rate',
      quality: SM2_QUALITY.HARD,
    });
    expect(resolveStudyKeyAction('3', true)).toEqual({
      type: 'rate',
      quality: SM2_QUALITY.GOOD,
    });
    expect(resolveStudyKeyAction('4', true)).toEqual({
      type: 'rate',
      quality: SM2_QUALITY.EASY,
    });
  });

  it('ignores an unrelated key in both modes', () => {
    expect(resolveStudyKeyAction('a', false)).toBeUndefined();
    expect(resolveStudyKeyAction('a', true)).toBeUndefined();
  });
});

describe('StudySessionPage keyboard map', () => {
  it('flips the card with Space', () => {
    const { container } = render(<StudySessionPage />);

    expect(correctButton()).toBeNull();
    fireEvent.keyDown(pageRoot(container), { key: ' ' });

    expect(correctButton()).toBeInTheDocument();
  });

  it('flips the card with Enter', () => {
    const { container } = render(<StudySessionPage />);

    fireEvent.keyDown(pageRoot(container), { key: 'Enter' });

    expect(correctButton()).toBeInTheDocument();
  });

  it('navigates to the next and previous card with the arrow keys', () => {
    const { container } = render(<StudySessionPage />);

    fireEvent.keyDown(pageRoot(container), { key: 'ArrowRight' });
    expect(front(/Frente dos/)).toBeInTheDocument();
    expect(reviewCard).not.toHaveBeenCalled();

    fireEvent.keyDown(pageRoot(container), { key: 'ArrowLeft' });
    expect(front(/Frente uno/)).toBeInTheDocument();
  });

  it('rates wrong with 1 and correct with 2 in simple mode', () => {
    const { container } = render(<StudySessionPage />);

    fireEvent.keyDown(pageRoot(container), { key: ' ' });
    fireEvent.keyDown(pageRoot(container), { key: '1' });

    expect(reviewCard).toHaveBeenCalledWith({
      artifactId: 'deck-1',
      cardIndex: 0,
      quality: SM2_QUALITY.AGAIN,
    });
    expect(front(/Frente dos/)).toBeInTheDocument();

    fireEvent.keyDown(pageRoot(container), { key: ' ' });
    fireEvent.keyDown(pageRoot(container), { key: '2' });

    expect(reviewCard).toHaveBeenCalledWith({
      artifactId: 'deck-1',
      cardIndex: 1,
      quality: SM2_QUALITY.GOOD,
    });
  });

  it('ignores a rating key before the card is flipped', () => {
    const { container } = render(<StudySessionPage />);

    fireEvent.keyDown(pageRoot(container), { key: '2' });

    expect(reviewCard).not.toHaveBeenCalled();
    expect(correctButton()).toBeNull();
  });

  it('never rates while a text input has focus', () => {
    const { container } = render(<StudySessionPage />);
    fireEvent.keyDown(pageRoot(container), { key: ' ' });
    expect(correctButton()).toBeInTheDocument();

    const input = document.createElement('input');
    pageRoot(container).appendChild(input);
    input.focus();

    fireEvent.keyDown(input, { key: '2' });

    expect(reviewCard).not.toHaveBeenCalled();
  });
});
