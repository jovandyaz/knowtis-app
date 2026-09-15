import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as MotionReact from 'motion/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@knowtis/design-system';
import {
  SM2_QUALITY,
  type FlashcardArtifact,
  type FlashcardProgress,
} from '@knowtis/shared-types';

import { useFlashcardSession } from './flashcard/use-flashcard-session';
import type * as UseFlashcardSessionModule from './flashcard/use-flashcard-session';
import { FlashcardStudy } from './FlashcardStudy';

const reviewCard = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useBlocker: () => ({ status: 'idle' }),
}));
const onClose = vi.fn();
const { useFlashcardProgressMock, refetchProgress, captureProductEvent } =
  vi.hoisted(() => {
    const refetchProgress = vi.fn();
    return {
      refetchProgress,
      captureProductEvent: vi.fn(),
      useFlashcardProgressMock: vi.fn(() => ({
        data: undefined as FlashcardProgress[] | undefined,
        isLoading: false,
        isError: false,
        refetch: refetchProgress,
      })),
    };
  });

type ProgressResult = ReturnType<typeof useFlashcardProgressMock>;

function progressResult(
  overrides: Partial<ProgressResult> = {}
): ProgressResult {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: refetchProgress,
    ...overrides,
  };
}

/** The jsdom matchMedia stub answers every non-width query, so the suite runs reduced by default. */
const reducedMotion = { value: true };

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts ? `${k} ${JSON.stringify(opts)}` : k,
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/analytics/product-events', () => ({ captureProductEvent }));
vi.mock('@knowtis/data-access-artifacts', () => ({
  useReviewCard: () => ({ mutateAsync: reviewCard, isPending: false }),
  useFlashcardProgress: useFlashcardProgressMock,
}));
vi.mock('motion/react', async () => {
  const actual = await vi.importActual<typeof MotionReact>('motion/react');
  return { ...actual, useReducedMotion: () => reducedMotion.value };
});
vi.mock('./flashcard/use-flashcard-session', async (importOriginal) => {
  const actual = await importOriginal<typeof UseFlashcardSessionModule>();
  return { ...actual, useFlashcardSession: vi.fn(actual.useFlashcardSession) };
});

const artifact = {
  id: 'deck-1',
  content: {
    cards: [
      { front: 'Front one', back: 'Back one', difficulty: 'easy' },
      { front: 'Front two', back: 'Back two', difficulty: 'hard' },
    ],
  },
} as unknown as FlashcardArtifact;

function renderStudy(readOnly = false) {
  return render(
    <TooltipProvider>
      <FlashcardStudy
        artifact={artifact}
        readOnly={readOnly}
        onClose={onClose}
      />
    </TooltipProvider>
  );
}

const CORRECT_BUTTON = { name: 'ai.artifacts.flashcards.correct' };
const PREV_BUTTON = { name: 'ai.artifacts.flashcards.prev' };
const NEXT_BUTTON = { name: 'ai.artifacts.flashcards.next' };
const SKIP_BUTTON = { name: 'ai.artifacts.flashcards.skipCard' };
const BACK_TO_NOTE_BUTTON = { name: 'ai.artifacts.focus.backToNote' };
const FRONT_ONE = { name: /Front one/ };
const FRONT_TWO = { name: /Front two/ };

async function rateCorrect(front: RegExp) {
  await userEvent.click(await screen.findByRole('button', { name: front }));
  await userEvent.click(screen.getByRole('button', CORRECT_BUTTON));
}

async function rateWholeDeck() {
  await rateCorrect(FRONT_ONE.name);
  await rateCorrect(FRONT_TWO.name);
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

const completedProgress = () => screen.getByRole('progressbar');

describe('FlashcardStudy', () => {
  it('keeps rating and navigation actions outside the scrolling stage', async () => {
    renderStudy();
    const stage = document.activeElement;
    await userEvent.click(await screen.findByRole('button', FRONT_ONE));
    const footer = screen.getByRole('contentinfo');
    expect(footer).toContainElement(screen.getByRole('button', CORRECT_BUTTON));
    expect(footer).toContainElement(screen.getByRole('button', NEXT_BUTTON));
    expect(stage).not.toContainElement(footer);
  });
  let randomSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    reviewCard.mockResolvedValue({ ok: true });
    useFlashcardProgressMock.mockReturnValue(progressResult());
  });

  afterEach(() => {
    reducedMotion.value = true;
    randomSpy?.mockRestore();
    randomSpy = undefined;
  });

  it('does not request flashcard progress for a read-only viewer', () => {
    renderStudy(true);

    expect(useFlashcardProgressMock).toHaveBeenCalledWith(undefined);
  });

  it('requests flashcard progress by artifact id when the viewer owns the deck', () => {
    renderStudy();

    expect(useFlashcardProgressMock).toHaveBeenCalledWith('deck-1');
  });

  it('shows a loading state and does not mount the session while progress is loading', () => {
    useFlashcardProgressMock.mockReturnValue(
      progressResult({ isLoading: true })
    );

    renderStudy();

    expect(screen.getByRole('progressbar')).toHaveAccessibleName(
      'ai.artifacts.loadingStudy'
    );
    expect(useFlashcardSession).not.toHaveBeenCalled();
  });

  it('says the progress failed instead of studying the deck as new', async () => {
    useFlashcardProgressMock.mockReturnValue(progressResult({ isError: true }));

    renderStudy();

    expect(
      screen.getByRole('heading', {
        name: 'ai.artifacts.flashcards.progressError',
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAccessibleName(
      'ai.artifacts.flashcards.progressError'
    );
    expect(useFlashcardSession).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('button', { name: 'buttons.tryAgain' })
    );

    expect(refetchProgress).toHaveBeenCalledTimes(1);
  });

  it('explains an empty deck and returns directly to the note', async () => {
    render(
      <FlashcardStudy
        artifact={{ ...artifact, content: { cards: [] } }}
        onClose={onClose}
      />
    );
    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: 'ai.artifacts.focus.emptyDeck',
        })
      ).toBeVisible()
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', BACK_TO_NOTE_BUTTON));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText('ai.artifacts.focus.exit.title')
    ).not.toBeInTheDocument();
    expect(reviewCard).not.toHaveBeenCalled();
  });

  it("mounts the session with a card's kind once its progress has loaded", async () => {
    const progress: FlashcardProgress[] = [
      {
        artifactId: 'deck-1',
        cardIndex: 0,
        easeFactor: 2.5,
        intervalDays: 3,
        repetitions: 1,
        nextReview: '2026-09-09T00:00:00.000Z',
      },
    ];
    useFlashcardProgressMock.mockReturnValue(
      progressResult({ data: progress })
    );

    renderStudy();

    await screen.findByRole('button', FRONT_ONE);
    const cards = vi.mocked(useFlashcardSession).mock.calls.at(-1)?.[0];
    expect(cards?.[0].kind).toBe('due');
  });

  it('shows the card position apart from the completed count', async () => {
    renderStudy();

    await userEvent.click(screen.getByRole('button', NEXT_BUTTON));

    expect(
      screen.getByText('ai.artifacts.focus.cardOf {"current":2,"total":2}')
    ).toBeInTheDocument();
    expect(completedProgress()).toHaveAttribute('aria-valuenow', '0');
  });

  it('advances a read-only session without recording the review', async () => {
    renderStudy(true);

    await rateCorrect(FRONT_ONE.name);

    expect(reviewCard).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', FRONT_TWO)).toBeInTheDocument();
  });

  it('records the review when the viewer owns the deck', async () => {
    renderStudy();

    await rateCorrect(FRONT_ONE.name);

    expect(reviewCard).toHaveBeenCalledTimes(1);
    expect(completedProgress()).toHaveAttribute('aria-valuenow', '1');
  });

  it('shows the recorded rating on a revisited card and continues to the next pending one', async () => {
    renderStudy();

    await rateCorrect(FRONT_ONE.name);
    await userEvent.click(screen.getByRole('button', PREV_BUTTON));
    await userEvent.click(await screen.findByRole('button', FRONT_ONE));

    expect(
      screen.getByText(
        'ai.artifacts.flashcards.recorded {"rating":"ai.artifacts.flashcards.quality.good"}'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', CORRECT_BUTTON)).toBeNull();
    expect(screen.getByRole('button', SKIP_BUTTON)).toBeDisabled();

    await userEvent.click(
      screen.getByRole('button', {
        name: 'ai.artifacts.flashcards.continueStudying',
      })
    );

    expect(await screen.findByRole('button', FRONT_TWO)).toBeInTheDocument();
    expect(reviewCard).toHaveBeenCalledTimes(1);
  });

  it('leaves the card unrated when the server refuses the review', async () => {
    reviewCard.mockRejectedValueOnce(new Error('refused'));
    renderStudy();

    await rateCorrect(FRONT_ONE.name);

    expect(
      await screen.findByRole('button', { name: 'Back one' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', FRONT_TWO)).toBeNull();
    expect(completedProgress()).toHaveAttribute('aria-valuenow', '0');
    expect(toast.error).toHaveBeenCalledWith(
      'ai.artifacts.flashcards.reviewError'
    );
  });

  it('advances once a refused review is accepted on the retry', async () => {
    reviewCard.mockRejectedValueOnce(new Error('refused'));
    renderStudy();

    await rateCorrect(FRONT_ONE.name);
    await userEvent.click(await screen.findByRole('button', CORRECT_BUTTON));

    expect(await screen.findByRole('button', FRONT_TWO)).toBeInTheDocument();
    expect(reviewCard).toHaveBeenCalledTimes(2);
  });

  it('takes no second rating while the first is still in flight', async () => {
    const releaseReview = deferReview();
    renderStudy();

    await rateCorrect(FRONT_ONE.name);
    await userEvent.click(screen.getByRole('button', CORRECT_BUTTON));

    expect(reviewCard).toHaveBeenCalledTimes(1);

    releaseReview();

    expect(await screen.findByRole('button', FRONT_TWO)).toBeInTheDocument();
    expect(reviewCard).toHaveBeenCalledTimes(1);
  });

  it('locks browsing and skipping while a rating is being saved', async () => {
    const releaseReview = deferReview();
    renderStudy();

    await rateCorrect(FRONT_ONE.name);

    expect(screen.getByRole('button', NEXT_BUTTON)).toBeDisabled();
    expect(screen.getByRole('button', SKIP_BUTTON)).toBeDisabled();
    const menu = screen.getByRole('button', {
      name: 'ai.artifacts.focus.options',
    });
    expect(menu).toBeDisabled();
    await userEvent.click(menu);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    releaseReview();

    expect(await screen.findByRole('button', FRONT_TWO)).toBeInTheDocument();
    expect(menu).toBeEnabled();
  });

  it('focuses the next card prompt after a saved rating', async () => {
    renderStudy();
    await rateCorrect(FRONT_ONE.name);
    await waitFor(() =>
      expect(screen.getByRole('button', FRONT_TWO)).toHaveFocus()
    );
  });

  it('does not carry a completed rating focus request into Practice again', async () => {
    renderStudy();
    await rateWholeDeck();
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'ai.artifacts.flashcards.summary.practiceAgain',
      })
    );
    expect(await screen.findByRole('button', FRONT_ONE)).not.toHaveFocus();
  });

  it('ignores a stale rating without announcing it or carrying focus into later browsing', async () => {
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const releaseReview = deferReview();
    renderStudy();
    await rateCorrect(FRONT_ONE.name);
    const session = vi.mocked(useFlashcardSession).mock.results.at(-1)?.value;
    if (!session) {
      throw new Error('Expected the real flashcard session to be mounted');
    }
    act(() => session.shuffle());
    await screen.findByRole('button', FRONT_TWO);
    await act(async () => releaseReview());
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(completedProgress()).toHaveAttribute('aria-valuenow', '0');
    await userEvent.click(screen.getByRole('button', NEXT_BUTTON));
    expect(await screen.findByRole('button', FRONT_ONE)).not.toHaveFocus();
  });

  it('announces a recorded rating and completion count in one polite status', async () => {
    renderStudy();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    await rateCorrect(FRONT_ONE.name);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveTextContent(
      'ai.artifacts.flashcards.announce.rated {"rating":"ai.artifacts.flashcards.quality.good","done":1,"count":2}'
    );
  });

  it('announces skipping and shuffling', async () => {
    renderStudy();
    await userEvent.click(screen.getByRole('button', SKIP_BUTTON));
    expect(screen.getByRole('status')).toHaveTextContent(
      'ai.artifacts.flashcards.announce.skipped {"done":1,"count":2}'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.options' })
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'ai.artifacts.flashcards.shuffle' })
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'ai.artifacts.flashcards.announce.shuffled'
    );
  });

  it('replaces live-region content so consecutive shuffles are announced again', async () => {
    renderStudy();
    const shuffle = async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'ai.artifacts.focus.options' })
      );
      await userEvent.click(
        screen.getByRole('menuitem', {
          name: 'ai.artifacts.flashcards.shuffle',
        })
      );
    };
    await shuffle();
    const status = screen.getByRole('status');
    const firstAnnouncement = status.firstChild;
    expect(status).toHaveTextContent(
      'ai.artifacts.flashcards.announce.shuffled'
    );
    await shuffle();
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent(
      'ai.artifacts.flashcards.announce.shuffled'
    );
    expect(status.firstChild).not.toBe(firstAnnouncement);
  });

  it('lets a skipped card be reviewed and graded when revisited', async () => {
    renderStudy();
    await userEvent.click(screen.getByRole('button', SKIP_BUTTON));
    await userEvent.click(screen.getByRole('button', PREV_BUTTON));
    await userEvent.click(await screen.findByRole('button', FRONT_ONE));
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.flashcards.reviewCard' })
    );
    expect(completedProgress()).toHaveAttribute('aria-valuenow', '0');
    await userEvent.click(screen.getByRole('button', CORRECT_BUTTON));
    expect(completedProgress()).toHaveAttribute('aria-valuenow', '1');
    expect(reviewCard).toHaveBeenCalledWith(
      expect.objectContaining({ cardIndex: 0, quality: SM2_QUALITY.GOOD })
    );
  });

  it('moves to the next card without counting the one it leaves', async () => {
    renderStudy();

    await userEvent.click(screen.getByRole('button', NEXT_BUTTON));

    expect(await screen.findByRole('button', FRONT_TWO)).toBeInTheDocument();
    expect(completedProgress()).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('button', NEXT_BUTTON)).toBeDisabled();

    await userEvent.click(screen.getByRole('button', PREV_BUTTON));

    expect(await screen.findByRole('button', FRONT_ONE)).toBeInTheDocument();
  });

  it('counts a card skipped only through the skip button', async () => {
    renderStudy();

    await userEvent.click(screen.getByRole('button', SKIP_BUTTON));
    expect(completedProgress()).toHaveAttribute('aria-valuenow', '1');
    await rateCorrect(FRONT_TWO.name);

    const skipped = await screen.findByRole('group', {
      name: 'ai.artifacts.flashcards.summary.skipped',
    });
    expect(within(skipped).getByText('1')).toBeInTheDocument();
  });

  it('flips the card with Space from the study stage', async () => {
    renderStudy();

    await screen.findByRole('button', FRONT_ONE);
    await userEvent.keyboard(' ');

    expect(
      await screen.findByRole('button', { name: 'Back one' })
    ).toBeInTheDocument();
  });

  it('rates a flipped card as recalled with the 2 key', async () => {
    renderStudy();

    await screen.findByRole('button', FRONT_ONE);
    await userEvent.keyboard('2');
    expect(reviewCard).not.toHaveBeenCalled();

    await userEvent.keyboard(' ');
    await userEvent.keyboard('2');

    expect(reviewCard).toHaveBeenCalledWith(
      expect.objectContaining({ cardIndex: 0, quality: SM2_QUALITY.GOOD })
    );
    expect(await screen.findByRole('button', FRONT_TWO)).toBeInTheDocument();
  });

  it('updates key hints from showing the answer to showing the question and rating', async () => {
    renderStudy();

    expect(
      screen.getByText('ai.artifacts.focus.hints.showAnswer')
    ).toBeInTheDocument();
    expect(
      screen.getByText('ai.artifacts.focus.hints.browse')
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', FRONT_ONE));

    expect(
      screen.getByText('ai.artifacts.focus.hints.showQuestion')
    ).toBeInTheDocument();
    expect(
      screen.getByText('ai.artifacts.flashcards.rateCard')
    ).toBeInTheDocument();
    expect(
      screen.getByText('ai.artifacts.focus.hints.exit')
    ).toBeInTheDocument();
  });

  it('restarts the deck at the first card with the counters cleared', async () => {
    renderStudy();

    await rateWholeDeck();
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'ai.artifacts.flashcards.summary.practiceAgain',
      })
    );

    expect(await screen.findByRole('button', FRONT_ONE)).toBeInTheDocument();
    expect(completedProgress()).toHaveAttribute('aria-valuenow', '0');
    expect(
      screen.getByText('ai.artifacts.flashcards.correct').parentElement
    ).toHaveTextContent('ai.artifacts.flashcards.correct0');
  });

  it('returns to the note from the summary', async () => {
    renderStudy();

    await rateWholeDeck();
    await userEvent.click(
      await screen.findByRole('button', BACK_TO_NOTE_BUTTON)
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('rates the shuffled card by its own identity, not by position', async () => {
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    renderStudy();
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.options' })
    );
    await userEvent.click(
      await screen.findByRole('menuitem', {
        name: 'ai.artifacts.flashcards.shuffle',
      })
    );
    await rateCorrect(FRONT_TWO.name);

    expect(reviewCard).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: 'deck-1', cardIndex: 1 })
    );
  });

  it('reports the deck session start once, sourced from the note', async () => {
    renderStudy();

    await screen.findByRole('button', FRONT_ONE);

    expect(captureProductEvent).toHaveBeenCalledTimes(1);
    expect(captureProductEvent).toHaveBeenCalledWith('study session started', {
      source: 'note',
      due_count: 0,
      new_count: 2,
    });
  });

  it('reports the deck session completion with its counts and duration bucket', async () => {
    renderStudy();

    await rateWholeDeck();
    await screen.findByRole('button', BACK_TO_NOTE_BUTTON);

    expect(captureProductEvent).toHaveBeenCalledWith(
      'study session completed',
      {
        source: 'note',
        reviewed_count: 2,
        correct_count: 2,
        duration_bucket: '<2m',
      }
    );
  });

  it('closes through the exit button when nothing has been answered', async () => {
    renderStudy();

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'ai.artifacts.focus.exitStudy',
      })
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('crossfades the two faces instead of flipping under reduced motion', () => {
    const { baseElement } = renderStudy();

    expect(baseElement.querySelectorAll('[data-face="stack"]')).toHaveLength(2);
    expect(baseElement.querySelector('[data-face="flip"]')).toBeNull();
  });

  it('flips the card in three dimensions when motion is allowed', () => {
    reducedMotion.value = false;
    const { baseElement } = renderStudy();

    expect(baseElement.querySelector('[data-face="flip"]')).not.toBeNull();
    expect(baseElement.querySelector('[data-face="stack"]')).toBeNull();
  });
});
