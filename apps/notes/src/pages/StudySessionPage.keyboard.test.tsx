import type { ReactNode } from 'react';

import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SM2_QUALITY,
  type StudyCard,
  type StudySession,
} from '@knowtis/shared-types';

import { resolveStudyKeyAction } from './study-key-action';
import { StudySessionPage } from './StudySessionPage';

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

const ARIA_SPACE_TOKEN = 'Space';

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

/** Resolves a microtask after the commit that satisfies `seen`, so no passive effect can have run yet. */
function onCommit(seen: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (seen()) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.body, { subtree: true, childList: true });
  });
}

const REVIEW_SETTLE_MICROTASKS = 6;

async function settleReview() {
  for (let step = 0; step < REVIEW_SETTLE_MICROTASKS; step++) {
    await Promise.resolve();
  }
}

function deferReview() {
  let release: (() => void) | undefined;
  reviewCard.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ ok: true });
      })
  );
  return () => release?.();
}

beforeEach(() => {
  vi.clearAllMocks();
  reviewCard.mockResolvedValue({ ok: true });
  queueOf([CARD_ONE, CARD_TWO]);
});

describe('StudySessionPage keyboard map', () => {
  it('flips the card with Space', () => {
    render(<StudySessionPage />);

    expect(correctButton()).toBeNull();
    fireEvent.keyDown(document.body, { key: ' ' });

    expect(correctButton()).toBeInTheDocument();
  });

  it('flips the card with Enter', () => {
    render(<StudySessionPage />);

    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(correctButton()).toBeInTheDocument();
  });

  it('navigates to the next and previous card with the arrow keys', () => {
    render(<StudySessionPage />);

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(front(/Frente dos/)).toBeInTheDocument();
    expect(reviewCard).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(front(/Frente uno/)).toBeInTheDocument();
  });

  it('comes back to the card the cursor skipped instead of re-rating the answered one', async () => {
    render(<StudySessionPage />);

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: '2' });

    expect(
      await screen.findByRole('button', { name: /Frente uno/ })
    ).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: '2' });

    expect(
      await screen.findByRole('link', { name: 'study.summary.backHome' })
    ).toBeInTheDocument();
    expect(reviewCard).toHaveBeenNthCalledWith(1, {
      artifactId: 'deck-1',
      cardIndex: 1,
      quality: SM2_QUALITY.GOOD,
    });
    expect(reviewCard).toHaveBeenNthCalledWith(2, {
      artifactId: 'deck-1',
      cardIndex: 0,
      quality: SM2_QUALITY.GOOD,
    });
    expect(reviewCard).toHaveBeenCalledTimes(2);
  });

  it('answers the next key with the card the deck advanced to, not the last one', async () => {
    render(<StudySessionPage />);

    const advanced = onCommit(
      () => screen.queryByRole('button', { name: /Frente dos/ }) !== null
    );

    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: '2' });
    await advanced;

    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });

    expect(
      screen.getByRole('button', { name: /Frente uno/ })
    ).toBeInTheDocument();
  });

  it('posts no second review for a card that was already answered', async () => {
    render(<StudySessionPage />);

    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: '2' });
    expect(
      await screen.findByRole('button', { name: /Frente dos/ })
    ).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: '2' });

    expect(reviewCard).toHaveBeenCalledTimes(1);
    expect(reviewCard).toHaveBeenCalledWith({
      artifactId: 'deck-1',
      cardIndex: 0,
      quality: SM2_QUALITY.GOOD,
    });
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '1'
    );
  });

  it('takes no second rating key while the first is still in flight', async () => {
    const releaseReview = deferReview();
    render(<StudySessionPage />);

    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: '2' });

    expect(
      screen.getByRole('button', { name: 'Dorso uno' })
    ).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: '2' });

    expect(reviewCard).toHaveBeenCalledTimes(1);

    releaseReview();

    expect(
      await screen.findByRole('button', { name: /Frente dos/ })
    ).toBeInTheDocument();
    expect(reviewCard).toHaveBeenCalledTimes(1);
  });

  it('takes no second rating key between the answer and the card it advances', async () => {
    const releaseReview = deferReview();
    render(<StudySessionPage />);

    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: '2' });
    expect(reviewCard).toHaveBeenCalledTimes(1);

    releaseReview();
    await settleReview();
    expect(
      screen.getByRole('button', { name: 'Dorso uno' })
    ).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: '2' });

    expect(reviewCard).toHaveBeenCalledTimes(1);
    expect(reviewCard).toHaveBeenCalledWith({
      artifactId: 'deck-1',
      cardIndex: 0,
      quality: SM2_QUALITY.GOOD,
    });
  });

  it('keeps the cursor on the card being recorded until the server answers', async () => {
    const releaseReview = deferReview();
    render(<StudySessionPage />);

    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: '2' });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });

    expect(
      screen.getByRole('button', { name: 'Dorso uno' })
    ).toBeInTheDocument();

    releaseReview();

    expect(
      await screen.findByRole('button', { name: /Frente dos/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '1'
    );
  });

  it('ignores a rating key raised inside a dialog, then rates once focus is back on the page', async () => {
    render(<StudySessionPage />);

    fireEvent.keyDown(document.body, { key: ' ' });
    expect(correctButton()).toBeInTheDocument();

    const dialog = document.body.appendChild(document.createElement('div'));
    dialog.setAttribute('role', 'dialog');
    const dialogTarget = dialog.appendChild(document.createElement('div'));
    dialogTarget.tabIndex = -1;
    dialogTarget.focus();

    fireEvent.keyDown(dialogTarget, { key: '2' });

    expect(reviewCard).not.toHaveBeenCalled();
    expect(correctButton()).toBeInTheDocument();

    dialog.remove();
    fireEvent.keyDown(document.body, { key: '2' });

    expect(reviewCard).toHaveBeenCalledWith({
      artifactId: 'deck-1',
      cardIndex: 0,
      quality: SM2_QUALITY.GOOD,
    });
    expect(
      await screen.findByRole('button', { name: /Frente dos/ })
    ).toBeInTheDocument();
  });

  it('rates wrong with 1 and correct with 2 in simple mode', async () => {
    render(<StudySessionPage />);

    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: '1' });

    expect(reviewCard).toHaveBeenCalledWith({
      artifactId: 'deck-1',
      cardIndex: 0,
      quality: SM2_QUALITY.AGAIN,
    });
    expect(
      await screen.findByRole('button', { name: /Frente dos/ })
    ).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: '2' });

    expect(reviewCard).toHaveBeenCalledWith({
      artifactId: 'deck-1',
      cardIndex: 1,
      quality: SM2_QUALITY.GOOD,
    });
    expect(
      await screen.findByRole('link', { name: 'study.summary.backHome' })
    ).toBeInTheDocument();
  });

  it('ignores a rating key before the card is flipped', () => {
    render(<StudySessionPage />);

    fireEvent.keyDown(document.body, { key: '2' });

    expect(reviewCard).not.toHaveBeenCalled();
    expect(correctButton()).toBeNull();
  });

  it('hands the keyboard back in the commit that shows the summary', async () => {
    render(<StudySessionPage />);

    const summaryUp = onCommit(
      () =>
        screen.queryByRole('link', { name: 'study.summary.backHome' }) !== null
    );

    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: '2' });
    expect(
      await screen.findByRole('button', { name: /Frente dos/ })
    ).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: '2' });
    await summaryUp;

    const event = createEvent.keyDown(document.body, { key: ' ' });
    fireEvent(document.body, event);

    expect(event.defaultPrevented).toBe(false);
    expect(reviewCard).toHaveBeenCalledTimes(2);
  });

  it('announces no shortcut the page does not answer', () => {
    render(<StudySessionPage />);

    const announced =
      front(/Frente uno/)
        .getAttribute('aria-keyshortcuts')
        ?.split(' ') ?? [];

    expect(announced.length).toBeGreaterThan(0);
    for (const token of announced) {
      const key = token === ARIA_SPACE_TOKEN ? ' ' : token;
      expect(resolveStudyKeyAction(key, false)).toBeDefined();
    }
  });

  it('announces the rating keys the simple mode buttons answer', () => {
    render(<StudySessionPage />);
    fireEvent.keyDown(document.body, { key: ' ' });

    const announced: [HTMLElement, number][] = [
      [
        screen.getByRole('button', { name: 'ai.artifacts.flashcards.wrong' }),
        SM2_QUALITY.AGAIN,
      ],
      [
        screen.getByRole('button', { name: 'ai.artifacts.flashcards.correct' }),
        SM2_QUALITY.GOOD,
      ],
    ];

    for (const [button, quality] of announced) {
      const key = button.getAttribute('aria-keyshortcuts');
      expect(key).not.toBeNull();
      expect(resolveStudyKeyAction(key ?? '', false)).toEqual({
        type: 'rate',
        quality,
      });
    }
  });

  it('never rates while a text input has focus', () => {
    render(<StudySessionPage />);
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(correctButton()).toBeInTheDocument();

    const input = document.body.appendChild(document.createElement('input'));
    input.focus();

    fireEvent.keyDown(input, { key: '2' });

    expect(reviewCard).not.toHaveBeenCalled();
    input.remove();
  });
});
