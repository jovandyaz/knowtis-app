import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as MotionReact from 'motion/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@knowtis/design-system';
import type {
  FlashcardArtifact,
  FlashcardProgress,
} from '@knowtis/shared-types';

import { useFlashcardSession } from './flashcard/use-flashcard-session';
import type * as UseFlashcardSessionModule from './flashcard/use-flashcard-session';
import { FlashcardStudy } from './FlashcardStudy';

const reviewCard = vi.fn();
const { useFlashcardProgressMock } = vi.hoisted(() => ({
  useFlashcardProgressMock: vi.fn(() => ({
    data: undefined as FlashcardProgress[] | undefined,
    isLoading: false,
    isError: false,
  })),
}));
const DEFAULT_PROGRESS_RESULT: ReturnType<typeof useFlashcardProgressMock> = {
  data: undefined,
  isLoading: false,
  isError: false,
};

/** The jsdom matchMedia stub answers every non-width query, so the suite runs reduced by default. */
const reducedMotion = { value: true };

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts ? `${k} ${JSON.stringify(opts)}` : k,
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
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
  render(
    <TooltipProvider>
      <FlashcardStudy artifact={artifact} readOnly={readOnly} />
    </TooltipProvider>
  );
}

const CORRECT_BUTTON = { name: 'ai.artifacts.flashcards.correct' };
const NEXT_BUTTON = { name: 'ai.artifacts.flashcards.next' };

async function rateCorrect(front: RegExp) {
  await userEvent.click(await screen.findByRole('button', { name: front }));
  await userEvent.click(screen.getByRole('button', CORRECT_BUTTON));
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

describe('FlashcardStudy', () => {
  let randomSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    reviewCard.mockResolvedValue({ ok: true });
    useFlashcardProgressMock.mockReturnValue(DEFAULT_PROGRESS_RESULT);
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
    useFlashcardProgressMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderStudy();

    expect(screen.getByText('ai.artifacts.loadingStudy')).toBeInTheDocument();
    expect(useFlashcardSession).not.toHaveBeenCalled();
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
    useFlashcardProgressMock.mockReturnValue({
      data: progress,
      isLoading: false,
      isError: false,
    });

    renderStudy();

    await screen.findByRole('button', { name: /Front one/ });
    const cards = vi.mocked(useFlashcardSession).mock.calls.at(-1)?.[0];
    expect(cards?.[0].kind).toBe('due');
  });

  it('advances a read-only session without recording the review', async () => {
    renderStudy(true);

    await rateCorrect(/Front one/);

    expect(reviewCard).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('button', { name: /Front two/ })
    ).toBeInTheDocument();
  });

  it('records the review when the viewer owns the deck', async () => {
    renderStudy();

    await rateCorrect(/Front one/);

    expect(reviewCard).toHaveBeenCalledTimes(1);
  });

  it('records no second review when the viewer goes back and rates a card again', async () => {
    renderStudy();

    await rateCorrect(/Front one/);
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.flashcards.prev' })
    );
    await rateCorrect(/Front one/);

    expect(reviewCard).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(useFlashcardSession).mock.results.at(-1)?.value.counts
    ).toEqual({ correct: 1, wrong: 0, skipped: 0 });
  });

  it('leaves the card unrated when the server refuses the review', async () => {
    reviewCard.mockRejectedValueOnce(new Error('refused'));
    renderStudy();

    await rateCorrect(/Front one/);

    expect(
      await screen.findByRole('button', { name: 'Back one' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Front two/ })).toBeNull();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0'
    );
    expect(toast.error).toHaveBeenCalledWith(
      'ai.artifacts.flashcards.reviewError'
    );
  });

  it('advances once a refused review is accepted on the retry', async () => {
    reviewCard.mockRejectedValueOnce(new Error('refused'));
    renderStudy();

    await rateCorrect(/Front one/);
    await userEvent.click(screen.getByRole('button', CORRECT_BUTTON));

    expect(
      await screen.findByRole('button', { name: /Front two/ })
    ).toBeInTheDocument();
    expect(reviewCard).toHaveBeenCalledTimes(2);
  });

  it('takes no second rating while the first is still in flight', async () => {
    const releaseReview = deferReview();
    renderStudy();

    await rateCorrect(/Front one/);
    await userEvent.click(screen.getByRole('button', CORRECT_BUTTON));

    expect(reviewCard).toHaveBeenCalledTimes(1);

    releaseReview();

    expect(
      await screen.findByRole('button', { name: /Front two/ })
    ).toBeInTheDocument();
    expect(reviewCard).toHaveBeenCalledTimes(1);
  });

  it('counts a card skipped when the next arrow leaves it unflipped', async () => {
    renderStudy();

    await userEvent.click(screen.getByRole('button', NEXT_BUTTON));
    await rateCorrect(/Front two/);

    const skipped = await screen.findByRole('group', {
      name: 'ai.artifacts.flashcards.summary.skipped',
    });
    expect(within(skipped).getByText('1')).toBeInTheDocument();
  });

  it('restarts the deck at the first card with the counters cleared', async () => {
    renderStudy();

    await rateCorrect(/Front one/);
    await rateCorrect(/Front two/);

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'ai.artifacts.flashcards.summary.practiceAgain',
      })
    );

    expect(
      await screen.findByRole('button', { name: /Front one/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0'
    );
    expect(
      screen.getByText('ai.artifacts.flashcards.correct').parentElement
    ).toHaveTextContent('ai.artifacts.flashcards.correct0');
  });

  it('rates the shuffled card by its own identity, not by position', async () => {
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    renderStudy();
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.flashcards.shuffle' })
    );
    await rateCorrect(/Front two/);

    expect(reviewCard).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: 'deck-1', cardIndex: 1 })
    );
  });

  it('crossfades the two faces instead of flipping under reduced motion', () => {
    const { container } = render(
      <TooltipProvider>
        <FlashcardStudy artifact={artifact} />
      </TooltipProvider>
    );

    expect(container.querySelectorAll('[data-face="stack"]')).toHaveLength(2);
    expect(container.querySelector('[data-face="flip"]')).toBeNull();
  });

  it('flips the card in three dimensions when motion is allowed', () => {
    reducedMotion.value = false;
    const { container } = render(
      <TooltipProvider>
        <FlashcardStudy artifact={artifact} />
      </TooltipProvider>
    );

    expect(container.querySelector('[data-face="flip"]')).not.toBeNull();
    expect(container.querySelector('[data-face="stack"]')).toBeNull();
  });
});
