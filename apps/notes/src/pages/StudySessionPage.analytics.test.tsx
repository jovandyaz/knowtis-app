import type { ReactNode } from 'react';

import { setAnalyticsContext } from '@/lib/analytics/product-events';
import {
  resumeAnalyticsCapture,
  setAnalyticsReady,
} from '@/lib/analytics/runtime';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  StudyCard,
  StudySession,
  StudyStats,
} from '@knowtis/shared-types';

import { StudySessionPage } from './StudySessionPage';

const { reviewCard, refetchQueue, posthog } = vi.hoisted(() => ({
  reviewCard: vi.fn(),
  refetchQueue: vi.fn(),
  posthog: { capture: vi.fn(), register: vi.fn() },
}));

let isQueueEnabled: boolean;
let sessionQuery: {
  data: StudySession | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: typeof refetchQueue;
};

vi.mock('@/lib/posthog', () => ({ posthog }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
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
  useFeatureFlags: () => ({
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useFeatureFlag: () => isQueueEnabled,
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

function makeStats(overrides: Partial<StudyStats> = {}): StudyStats {
  return {
    dueCount: 0,
    newCount: 0,
    reviewedToday: 0,
    currentStreak: 0,
    totalCardsStudied: 0,
    nextDueAt: null,
    ...overrides,
  };
}

function queueOf(cards: StudyCard[]) {
  sessionQuery = {
    data: { cards, stats: makeStats() },
    isPending: false,
    isError: false,
    refetch: refetchQueue,
  };
}

function serveOnRefetch(cards: StudyCard[]) {
  refetchQueue.mockImplementation(() => {
    queueOf(cards);
    return Promise.resolve({ isError: false, data: sessionQuery.data });
  });
}

const front = (text: RegExp) => screen.getByRole('button', { name: text });
const correctButton = () =>
  screen.getByRole('button', { name: 'ai.artifacts.flashcards.correct' });

async function rateCurrentCorrect(text: RegExp) {
  await userEvent.click(front(text));
  await userEvent.click(correctButton());
}

const CONTEXT = {
  environment: 'production' as const,
  app_version: '0.0.0-test',
  actor_type: 'anonymous' as const,
  is_internal: false,
  locale: 'es',
};

beforeEach(() => {
  vi.clearAllMocks();
  reviewCard.mockResolvedValue({ ok: true });
  refetchQueue.mockResolvedValue({ isError: false, data: undefined });
  isQueueEnabled = true;
  setAnalyticsReady(true);
  resumeAnalyticsCapture();
  setAnalyticsContext(CONTEXT);
  queueOf([
    makeCard({ kind: 'due' }),
    makeCard({
      cardIndex: 1,
      front: 'Frente dos',
      back: 'Dorso dos',
      kind: 'new',
    }),
  ]);
});

describe('StudySessionPage analytics', () => {
  it('reports the session start with the due and new counts, once', () => {
    const { rerender } = render(<StudySessionPage />);
    rerender(<StudySessionPage />);

    expect(posthog.capture).toHaveBeenCalledTimes(1);
    expect(posthog.capture).toHaveBeenCalledWith('study session started', {
      ...CONTEXT,
      source: 'queue',
      due_count: 1,
      new_count: 1,
    });
  });

  it('does not report a session start when the flag is off', () => {
    isQueueEnabled = false;

    render(<StudySessionPage />);

    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it('reports completion once with the counts and duration bucket when the queue finishes', async () => {
    queueOf([makeCard({ kind: 'due' })]);

    render(<StudySessionPage />);
    vi.clearAllMocks();

    await rateCurrentCorrect(/Frente uno/);

    const completedCalls = posthog.capture.mock.calls.filter(
      ([event]) => event === 'study session completed'
    );
    expect(completedCalls).toHaveLength(1);
    expect(completedCalls[0][1]).toEqual({
      ...CONTEXT,
      source: 'queue',
      reviewed_count: 1,
      correct_count: 1,
      duration_bucket: '<2m',
    });
  });

  it('fires a fresh session start after a restart', async () => {
    queueOf([makeCard({ kind: 'due' })]);
    render(<StudySessionPage />);

    await rateCurrentCorrect(/Frente uno/);

    serveOnRefetch([
      makeCard({
        cardIndex: 2,
        front: 'Frente tres',
        back: 'Dorso tres',
        kind: 'new',
      }),
    ]);

    await userEvent.click(
      screen.getByRole('button', {
        name: 'ai.artifacts.flashcards.summary.practiceAgain',
      })
    );

    const startCalls = posthog.capture.mock.calls.filter(
      ([event]) => event === 'study session started'
    );
    expect(startCalls).toHaveLength(2);
    expect(startCalls[1][1]).toEqual({
      ...CONTEXT,
      source: 'queue',
      due_count: 0,
      new_count: 1,
    });
  });
});
