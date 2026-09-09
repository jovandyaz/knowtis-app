import type { ReactNode } from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as MotionReact from 'motion/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SM2_QUALITY,
  type StudyCard,
  type StudySession,
  type StudyStats,
} from '@knowtis/shared-types';
import { formatRelativeTime } from '@knowtis/shared-util';

import { StudySessionPage } from './StudySessionPage';

const {
  reviewCard,
  navigateTo,
  studySessionSpy,
  studyStatsSpy,
  refetchQueue,
  refetchFlags,
} = vi.hoisted(() => ({
  reviewCard: vi.fn(),
  navigateTo: vi.fn(),
  studySessionSpy: vi.fn(),
  studyStatsSpy: vi.fn(),
  refetchQueue: vi.fn(),
  refetchFlags: vi.fn(),
}));

let flagsQuery: {
  isPending: boolean;
  isError: boolean;
  refetch: typeof refetchFlags;
};
let isQueueEnabled: boolean;
let sessionQuery: {
  data: StudySession | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: typeof refetchQueue;
};
let statsQuery: { data: StudyStats | undefined };

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
  Navigate: (props: { to: string }) => {
    navigateTo(props.to);
    return null;
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('motion/react', async () => {
  const actual = await vi.importActual<typeof MotionReact>('motion/react');
  return { ...actual, useReducedMotion: () => true };
});
vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlags: () => flagsQuery,
  useFeatureFlag: () => isQueueEnabled,
}));
vi.mock('@knowtis/data-access-artifacts', () => ({
  useStudySession: (timeZone: string) => {
    studySessionSpy(timeZone);
    return sessionQuery;
  },
  useStudyStats: (timeZone: string) => {
    studyStatsSpy(timeZone);
    return statsQuery;
  },
  useReviewCard: () => ({ mutateAsync: reviewCard, isPending: false }),
}));

const NEXT_DUE_AT = '2099-01-01T09:00:00.000Z';

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
    dueCount: 2,
    newCount: 1,
    reviewedToday: 0,
    currentStreak: 3,
    totalCardsStudied: 12,
    nextDueAt: null,
    ...overrides,
  };
}

function queueOf(cards: StudyCard[], stats = makeStats()) {
  sessionQuery = {
    data: { cards, stats },
    isPending: false,
    isError: false,
    refetch: refetchQueue,
  };
}

function serveOnRefetch(cards: StudyCard[], stats = makeStats()) {
  refetchQueue.mockImplementation(() => {
    queueOf(cards, stats);
    return Promise.resolve({ isError: false, data: sessionQuery.data });
  });
}

function failOnRefetch() {
  refetchQueue.mockImplementation(() =>
    Promise.resolve({ isError: true, data: undefined })
  );
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

const CARD_ONE = makeCard();
const CARD_TWO = makeCard({
  cardIndex: 1,
  front: 'Frente dos',
  back: 'Dorso dos',
  deckTitle: 'Historia',
});

const STALE_STREAK = 99;

const front = (text: RegExp) => screen.getByRole('button', { name: text });
const advancedToggle = () =>
  screen.getByRole('switch', { name: 'ai.artifacts.flashcards.advancedMode' });
const ratingBar = () =>
  screen.queryByRole('group', { name: 'ai.artifacts.flashcards.rateCard' });
const practiseAgain = () =>
  screen.getByRole('button', {
    name: 'ai.artifacts.flashcards.summary.practiceAgain',
  });
const correctButton = () =>
  screen.getByRole('button', { name: 'ai.artifacts.flashcards.correct' });
const summaryTile = (name: string) => screen.getByRole('group', { name });

async function rateCurrentCorrect(text: RegExp) {
  await userEvent.click(front(text));
  await userEvent.click(correctButton());
}

beforeEach(() => {
  vi.clearAllMocks();
  reviewCard.mockResolvedValue({ ok: true });
  refetchQueue.mockResolvedValue({ isError: false, data: undefined });
  flagsQuery = { isPending: false, isError: false, refetch: refetchFlags };
  isQueueEnabled = true;
  statsQuery = { data: makeStats({ currentStreak: STALE_STREAK }) };
  queueOf([CARD_ONE, CARD_TWO]);
});

describe('StudySessionPage', () => {
  it('renders the card frame while the session is loading', () => {
    sessionQuery = {
      data: undefined,
      isPending: true,
      isError: false,
      refetch: refetchQueue,
    };

    render(<StudySessionPage />);

    expect(
      screen.getByRole('status', { name: 'study.loading' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('says everything is caught up and offers a way back when there are no cards', () => {
    queueOf([], makeStats({ dueCount: 0, nextDueAt: NEXT_DUE_AT }));

    render(<StudySessionPage />);

    expect(screen.getByText('study.caughtUp.title')).toBeInTheDocument();
    expect(screen.getByText(/study\.caughtUp\.nextReview/)).toHaveTextContent(
      formatRelativeTime(new Date(NEXT_DUE_AT), 'es')
    );
    expect(
      screen.getByText(/study\.caughtUp\.nextReview/)
    ).not.toHaveTextContent(NEXT_DUE_AT);
    expect(
      screen.getByRole('link', { name: 'study.caughtUp.cta' })
    ).toHaveAttribute('href', '/notes');
  });

  it('says the queue failed instead of claiming everything is done', async () => {
    sessionQuery = {
      data: undefined,
      isPending: false,
      isError: true,
      refetch: refetchQueue,
    };

    render(<StudySessionPage />);

    expect(screen.getByText('errors.errorLoadingData')).toBeInTheDocument();
    expect(screen.queryByText('study.caughtUp.title')).toBeNull();

    await userEvent.click(
      screen.getByRole('button', { name: /buttons\.tryAgain/ })
    );
    expect(refetchQueue).toHaveBeenCalledTimes(1);
  });

  it('plays the queue: the first card, its deck chip, and a progress bar over the total', () => {
    render(<StudySessionPage />);

    expect(front(/Frente uno/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Frente dos/ })).toBeNull();
    expect(screen.getByText('Biología')).toBeInTheDocument();

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '2');
  });

  it('counts a one-card queue in the singular', () => {
    queueOf([CARD_ONE]);

    render(<StudySessionPage />);

    expect(
      screen.getByRole('progressbar', {
        name: 'ai.artifacts.flashcards.reviewedOf {"reviewed":0,"count":1}',
      })
    ).toBeInTheDocument();
  });

  it('marks a new card as new', () => {
    queueOf([makeCard({ kind: 'new' })]);
    const { unmount } = render(<StudySessionPage />);

    expect(screen.getByText('study.newBadge')).toBeInTheDocument();
    unmount();

    queueOf([makeCard({ kind: 'due' })]);
    render(<StudySessionPage />);

    expect(screen.queryByText('study.newBadge')).toBeNull();
  });

  it('rates the current card against its own artifact', async () => {
    queueOf([makeCard({ artifactId: 'deck-9', cardIndex: 4 }), CARD_TWO]);
    render(<StudySessionPage />);

    await rateCurrentCorrect(/Frente uno/);

    expect(reviewCard).toHaveBeenCalledWith({
      artifactId: 'deck-9',
      cardIndex: 4,
      quality: SM2_QUALITY.GOOD,
    });
    expect(front(/Frente dos/)).toBeInTheDocument();
  });

  it('leaves a refused card unrated instead of counting it and moving on', async () => {
    queueOf([CARD_ONE]);
    reviewCard.mockRejectedValueOnce(new Error('refused'));
    render(<StudySessionPage />);

    await rateCurrentCorrect(/Frente uno/);

    expect(
      await screen.findByRole('button', { name: 'Dorso uno' })
    ).toBeInTheDocument();
    expect(
      screen.queryByText('ai.artifacts.flashcards.summary.gotIt')
    ).toBeNull();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0'
    );
    expect(toast.error).toHaveBeenCalledWith(
      'ai.artifacts.flashcards.reviewError'
    );
    expect(correctButton()).toBeInTheDocument();
  });

  it('counts the card once a refused review is accepted on the retry', async () => {
    queueOf([CARD_ONE]);
    reviewCard.mockRejectedValueOnce(new Error('refused'));
    render(<StudySessionPage />);

    await rateCurrentCorrect(/Frente uno/);
    await userEvent.click(correctButton());

    expect(
      within(
        await screen.findByRole('group', {
          name: 'ai.artifacts.flashcards.summary.gotIt',
        })
      ).getByText('1')
    ).toBeInTheDocument();
    expect(reviewCard).toHaveBeenCalledTimes(2);
  });

  it('takes no second rating while the first is still in flight', async () => {
    const releaseReview = deferReview();
    render(<StudySessionPage />);

    await rateCurrentCorrect(/Frente uno/);
    await userEvent.click(correctButton());

    expect(reviewCard).toHaveBeenCalledTimes(1);

    releaseReview();

    expect(
      await screen.findByRole('button', { name: /Frente dos/ })
    ).toBeInTheDocument();
    expect(reviewCard).toHaveBeenCalledTimes(1);
  });

  it('shows the summary with the counts and the streak once the queue is done', async () => {
    queueOf([CARD_ONE], makeStats({ currentStreak: 7 }));
    render(<StudySessionPage />);

    await rateCurrentCorrect(/Frente uno/);

    expect(
      screen.getByText('ai.artifacts.flashcards.summary.gotIt')
    ).toBeInTheDocument();
    expect(
      screen.getByText('ai.artifacts.flashcards.summary.missedIt')
    ).toBeInTheDocument();
    expect(
      screen.getByText('ai.artifacts.flashcards.summary.skipped')
    ).toBeInTheDocument();
    expect(screen.getByText(/study\.summary\.streak/)).toHaveTextContent(
      '"count":7'
    );
    expect(
      screen.getByRole('link', { name: 'study.summary.backHome' })
    ).toHaveAttribute('href', '/dashboard');
  });

  it('takes the streak from the queue payload instead of asking for it again', async () => {
    queueOf([CARD_ONE], makeStats({ currentStreak: 7 }));
    render(<StudySessionPage />);

    await rateCurrentCorrect(/Frente uno/);

    expect(screen.getByText(/study\.summary\.streak/)).toHaveTextContent(
      '"count":7'
    );
    expect(studyStatsSpy).not.toHaveBeenCalled();
  });

  it('keeps the session away from a visitor whose flag is off', () => {
    isQueueEnabled = false;

    render(<StudySessionPage />);

    expect(navigateTo).toHaveBeenCalledWith('/dashboard');
    expect(studySessionSpy).not.toHaveBeenCalled();
    expect(studyStatsSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('button', { name: /Frente uno/ })).toBeNull();
  });

  it('waits for the flags before sending anyone away', () => {
    flagsQuery = { ...flagsQuery, isPending: true };
    isQueueEnabled = false;

    render(<StudySessionPage />);

    expect(navigateTo).not.toHaveBeenCalled();
    expect(
      screen.getByRole('status', { name: 'study.loading' })
    ).toBeInTheDocument();
  });

  it('ignores a reordered refetch while a session is in progress', async () => {
    const { rerender } = render(<StudySessionPage />);

    await rateCurrentCorrect(/Frente uno/);
    expect(front(/Frente dos/)).toBeInTheDocument();

    queueOf([makeCard({ cardIndex: 9, front: 'Frente nueve' }), CARD_TWO]);
    rerender(<StudySessionPage />);

    expect(front(/Frente dos/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Frente nueve/ })).toBeNull();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuemax',
      '2'
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '1'
    );
  });

  it('goes back to the server before practising the queue again', async () => {
    queueOf([CARD_ONE]);
    render(<StudySessionPage />);
    await rateCurrentCorrect(/Frente uno/);

    serveOnRefetch([
      makeCard({ cardIndex: 5, front: 'Frente cinco', back: 'Dorso cinco' }),
    ]);
    await userEvent.click(practiseAgain());

    expect(refetchQueue).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('button', { name: /Frente cinco/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Frente uno/ })).toBeNull();
  });

  it('lands on all caught up when practising again returns nothing', async () => {
    queueOf([CARD_ONE]);
    render(<StudySessionPage />);
    await rateCurrentCorrect(/Frente uno/);

    serveOnRefetch([], makeStats({ dueCount: 0, nextDueAt: NEXT_DUE_AT }));
    await userEvent.click(practiseAgain());

    expect(await screen.findByText('study.caughtUp.title')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Frente uno/ })).toBeNull();
  });

  it('keeps the summary and says so when practising again cannot reach the server', async () => {
    queueOf([CARD_ONE], makeStats({ currentStreak: 7 }));
    render(<StudySessionPage />);
    await rateCurrentCorrect(/Frente uno/);

    failOnRefetch();
    await userEvent.click(practiseAgain());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'study.summary.restartFailed'
    );
    expect(
      within(summaryTile('ai.artifacts.flashcards.summary.gotIt')).getByText(
        '1'
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/study\.summary\.streak/)).toHaveTextContent(
      '"count":7'
    );
    expect(practiseAgain()).toBeInTheDocument();
    expect(screen.queryByText('errors.errorLoadingData')).toBeNull();
  });

  it('plays the fresh queue when practising again works on the second try', async () => {
    queueOf([CARD_ONE]);
    render(<StudySessionPage />);
    await rateCurrentCorrect(/Frente uno/);

    failOnRefetch();
    await userEvent.click(practiseAgain());
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    serveOnRefetch([
      makeCard({ cardIndex: 5, front: 'Frente cinco', back: 'Dorso cinco' }),
    ]);
    await userEvent.click(practiseAgain());

    expect(
      await screen.findByRole('button', { name: /Frente cinco/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so instead of redirecting when the flags cannot be read', async () => {
    flagsQuery = { isPending: false, isError: true, refetch: refetchFlags };
    isQueueEnabled = false;

    render(<StudySessionPage />);

    expect(navigateTo).not.toHaveBeenCalled();
    expect(screen.getByText('errors.errorLoadingData')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /buttons\.tryAgain/ })
    );
    expect(refetchFlags).toHaveBeenCalledTimes(1);
  });

  it('picks up a queue that only arrives on a later fetch', () => {
    queueOf([], makeStats({ dueCount: 0 }));
    const { rerender } = render(<StudySessionPage />);

    expect(screen.getByText('study.caughtUp.title')).toBeInTheDocument();

    queueOf([CARD_ONE, CARD_TWO]);
    rerender(<StudySessionPage />);

    expect(front(/Frente uno/)).toBeInTheDocument();
    expect(screen.queryByText('study.caughtUp.title')).toBeNull();
  });

  it('announces the flip and navigation shortcuts on the card', () => {
    render(<StudySessionPage />);

    expect(front(/Frente uno/)).toHaveAttribute(
      'aria-keyshortcuts',
      'Space Enter ArrowLeft ArrowRight'
    );
  });

  it('never puts the back of a card on its front', async () => {
    render(<StudySessionPage />);

    expect(front(/Frente uno/)).toHaveAccessibleName('Frente uno');

    await userEvent.click(front(/Frente uno/));

    expect(
      screen.getByRole('button', { name: 'Dorso uno' })
    ).toBeInTheDocument();
  });

  it('swaps the two rating buttons for the four-way bar in advanced mode', async () => {
    render(<StudySessionPage />);
    await userEvent.click(front(/Frente uno/));

    expect(correctButton()).toBeInTheDocument();
    expect(ratingBar()).toBeNull();

    await userEvent.click(advancedToggle());

    expect(
      screen.queryByRole('button', { name: 'ai.artifacts.flashcards.correct' })
    ).toBeNull();
    expect(ratingBar()).toBeInTheDocument();
  });

  it('captions the advanced ratings with the current card own intervals', async () => {
    render(<StudySessionPage />);

    await userEvent.click(advancedToggle());
    await userEvent.click(front(/Frente uno/));

    expect(
      screen.getByRole('button', {
        name: 'ai.artifacts.flashcards.quality.good, ai.artifacts.flashcards.intervalDays {"count":4}',
      })
    ).toBeInTheDocument();
  });

  it('rates good with the 3 key and announces the shortcut', async () => {
    queueOf([makeCard({ artifactId: 'deck-3', cardIndex: 7 }), CARD_TWO]);
    render(<StudySessionPage />);

    await userEvent.click(advancedToggle());
    await userEvent.click(front(/Frente uno/));

    expect(
      screen.getByRole('button', { name: /quality\.good/ })
    ).toHaveAttribute('aria-keyshortcuts', '3');

    fireEvent.keyDown(document.body, { key: '3' });

    expect(reviewCard).toHaveBeenCalledWith({
      artifactId: 'deck-3',
      cardIndex: 7,
      quality: SM2_QUALITY.GOOD,
    });
    expect(
      await screen.findByRole('button', { name: /Frente dos/ })
    ).toBeInTheDocument();
  });

  it('drops the stale intervals when replaying the cards that were missed', async () => {
    queueOf([CARD_ONE]);
    render(<StudySessionPage />);

    await userEvent.click(advancedToggle());
    await userEvent.click(front(/Frente uno/));
    expect(
      screen.getByRole('button', {
        name: 'ai.artifacts.flashcards.quality.good, ai.artifacts.flashcards.intervalDays {"count":4}',
      })
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /quality\.again/ })
    );

    await userEvent.click(practiseAgain());
    await userEvent.click(
      screen.getByRole('menuitem', {
        name: 'ai.artifacts.flashcards.summary.onlyMissed',
      })
    );
    await userEvent.click(front(/Frente uno/));

    expect(
      screen.getByRole('button', {
        name: 'ai.artifacts.flashcards.quality.good',
      })
    ).toBeInTheDocument();
  });

  it('keeps playing when the refetched queue comes back empty', async () => {
    const { rerender } = render(<StudySessionPage />);

    await rateCurrentCorrect(/Frente uno/);

    queueOf([]);
    rerender(<StudySessionPage />);

    expect(front(/Frente dos/)).toBeInTheDocument();
    expect(screen.queryByText('study.caughtUp.title')).toBeNull();
  });
});
