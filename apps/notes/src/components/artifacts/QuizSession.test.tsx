import { StrictMode } from 'react';

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuizArtifact } from '@knowtis/shared-types';

import { QuizSession } from './QuizSession';

const mutateAsync = vi.fn().mockResolvedValue({ score: 1 });
const onClose = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useBlocker: () => ({ status: 'idle' }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@knowtis/data-access-artifacts', () => ({
  useSubmitQuiz: () => ({ mutateAsync, isPending: false }),
}));

const artifact: QuizArtifact = {
  id: 'quiz-1',
  userId: 'user-1',
  sourceNoteId: 'note-1',
  title: 'Geography',
  type: 'quiz',
  createdAt: '2026-09-14',
  updatedAt: '2026-09-14',
  content: {
    questions: [
      {
        question: '¿Capital de Francia?',
        options: ['Madrid', 'París', 'Roma'],
        correctIndex: 1,
        explanation: 'París es la capital.',
      },
    ],
  },
};
const twoQuestionArtifact: QuizArtifact = {
  ...artifact,
  id: 'quiz-2',
  content: {
    questions: [
      {
        question: '¿Uno?',
        options: ['Uno', 'Dos'],
        correctIndex: 0,
        explanation: '',
      },
      {
        question: '¿Dos?',
        options: ['Tres', 'Cuatro'],
        correctIndex: 1,
        explanation: 'Dos más dos son cuatro.',
      },
    ],
  },
};

async function checkOption(index: number) {
  await userEvent.click(screen.getAllByRole('radio')[index]);
  await userEvent.click(
    screen.getByRole('button', { name: 'ai.artifacts.quiz.checkAnswer' })
  );
}
async function advance() {
  await userEvent.click(
    screen.getByRole('button', { name: /^ai\.artifacts\.quiz\.(next|finish)$/ })
  );
}
async function finishMixedRun() {
  await checkOption(0);
  await advance();
  await checkOption(0);
  await advance();
}

describe('QuizSession', () => {
  it('keeps Check and Next outside the scrolling stage', async () => {
    render(<QuizSession artifact={twoQuestionArtifact} onClose={onClose} />);
    const stage = document.activeElement;
    const footer = screen.getByRole('contentinfo');
    expect(footer).toContainElement(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.checkAnswer' })
    );
    await checkOption(0);
    expect(footer).toContainElement(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.next' })
    );
    expect(stage).not.toContainElement(footer);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue({ score: 1 });
  });

  it('explains an empty quiz and returns directly to the note', async () => {
    render(
      <QuizSession
        artifact={{ ...artifact, content: { questions: [] } }}
        onClose={onClose}
      />
    );
    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: 'ai.artifacts.focus.emptyQuiz',
        })
      ).toBeVisible()
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', {
        name: 'ai.artifacts.focus.backToNote',
      })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText('ai.artifacts.focus.exit.title')
    ).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('names the radio group by its question and starts with one option tab stop', async () => {
    render(<QuizSession artifact={artifact} onClose={onClose} />);
    await waitFor(() =>
      expect(
        screen.getByRole('radiogroup', { name: '¿Capital de Francia?' })
      ).toBeVisible()
    );
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios[0]).toHaveAttribute('tabindex', '0');
    expect(radios[1]).toHaveAttribute('tabindex', '-1');
    expect(radios[2]).toHaveAttribute('tabindex', '-1');
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.checkAnswer' })
    ).toBeDisabled();
  });

  it('lets selection change without feedback or progress until Check', async () => {
    render(<QuizSession artifact={artifact} onClose={onClose} />);
    await userEvent.click(screen.getByRole('radio', { name: /Madrid/ }));
    await userEvent.click(screen.getByRole('radio', { name: /París/ }));
    expect(screen.getByRole('radio', { name: /París/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('radio', { name: /Madrid/ })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0'
    );
    expect(screen.queryByText('París es la capital.')).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('uses the adaptive reading scale without revealing grading on selection', async () => {
    const question = 'L'.repeat(201);
    render(
      <QuizSession
        artifact={{
          ...artifact,
          content: {
            questions: [
              {
                question,
                options: ['Correct choice', 'Wrong choice'],
                correctIndex: 0,
                explanation: '',
              },
            ],
          },
        }}
        onClose={onClose}
      />
    );
    expect(screen.getByText(question)).toHaveClass(
      'font-serif',
      'text-lg',
      'lg:text-xl',
      'text-left'
    );
    await userEvent.click(screen.getByRole('radio', { name: /Wrong choice/ }));
    expect(screen.getByRole('radio', { name: /Wrong choice/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('radio', { name: /Wrong choice/ })).toHaveAttribute(
      'data-state',
      'selected'
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0'
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.checkAnswer' })
    );
    expect(screen.getByRole('radio', { name: /Wrong choice/ })).toHaveAttribute(
      'data-state',
      'incorrect'
    );
    expect(
      screen.getByRole('radio', { name: /Correct choice/ })
    ).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '1'
    );
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.finish' })
    ).toHaveFocus();
  });

  it('checks and locks a wrong answer, revealing the correct answer without selecting it', async () => {
    render(<QuizSession artifact={artifact} onClose={onClose} />);
    await checkOption(0);
    expect(screen.getByRole('radio', { name: /Madrid/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('radio', { name: /Madrid/ })).toHaveAttribute(
      'data-state',
      'incorrect'
    );
    expect(screen.getByRole('radio', { name: /París/ })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(screen.getByRole('radio', { name: /París/ })).toHaveAttribute(
      'data-state',
      'correct'
    );
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
    expect(screen.getByRole('status')).toHaveTextContent(
      'ai.artifacts.quiz.outcomeIncorrect {"letter":"B","answer":"París"}'
    );
    expect(screen.getByText('París es la capital.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.finish' })
    ).toHaveFocus();
  });

  it('shows only the shell progressbar and counts checked answers rather than position', async () => {
    render(<QuizSession artifact={twoQuestionArtifact} onClose={onClose} />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAccessibleName(
      'ai.artifacts.focus.trackLabel {"done":0,"count":2}'
    );
    expect(bar).toHaveAttribute('aria-valuemax', '2');
    await waitFor(() =>
      expect(
        screen.getByText(
          'ai.artifacts.focus.questionOf {"current":1,"total":2}'
        )
      ).toBeVisible()
    );
    await checkOption(0);
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    await advance();
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getAllByRole('radio')[0]).toHaveFocus();
  });

  it('uses digits to select, Enter to check a focused radio, and native Enter to advance once', async () => {
    render(<QuizSession artifact={twoQuestionArtifact} onClose={onClose} />);
    act(() => {
      screen.getAllByRole('radio')[0].focus();
    });
    await userEvent.keyboard('2');
    expect(screen.getAllByRole('radio')[1]).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent(
      'ai.artifacts.quiz.outcomeIncorrect'
    );
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.next' })
    ).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('radiogroup', { name: '¿Dos?' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.checkAnswer' })
    ).toBeDisabled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('keeps native Check button activation and advances Enter from the stage after feedback', async () => {
    render(<QuizSession artifact={twoQuestionArtifact} onClose={onClose} />);
    await userEvent.keyboard('1');
    act(() => {
      screen
        .getByRole('button', { name: 'ai.artifacts.quiz.checkAnswer' })
        .focus();
    });
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent(
      'ai.artifacts.quiz.outcomeCorrect'
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
    expect(screen.getByRole('radiogroup', { name: '¿Dos?' })).toBeVisible();
  });

  it('selects with arrow keys and wraps without checking', async () => {
    render(<QuizSession artifact={artifact} onClose={onClose} />);
    act(() => {
      screen.getAllByRole('radio')[0].focus();
    });
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getAllByRole('radio')[2]).toHaveFocus();
    expect(screen.getAllByRole('radio')[2]).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getAllByRole('radio')[0]).toHaveFocus();
    expect(screen.getAllByRole('radio')[0]).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('keeps radio focus aligned with digit selection before arrow navigation', async () => {
    render(<QuizSession artifact={artifact} onClose={onClose} />);
    act(() => screen.getAllByRole('radio')[0].focus());
    await userEvent.keyboard('3');
    expect(screen.getAllByRole('radio')[2]).toHaveFocus();
    expect(screen.getAllByRole('radio')[2]).toHaveAttribute('tabindex', '0');
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getAllByRole('radio')[1]).toHaveFocus();
    expect(screen.getAllByRole('radio')[1]).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('lets Space select a focused option without grading', async () => {
    render(<QuizSession artifact={artifact} onClose={onClose} />);
    act(() => {
      screen.getAllByRole('radio')[1].focus();
    });
    await userEvent.keyboard(' ');
    expect(screen.getAllByRole('radio')[1]).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('supports a fifth option and ignores nonexistent digits', async () => {
    const fiveOptions: QuizArtifact = {
      ...artifact,
      content: {
        questions: [
          {
            ...artifact.content.questions[0],
            options: ['A', 'B', 'C', 'D', 'E'],
          },
        ],
      },
    };
    render(<QuizSession artifact={fiveOptions} onClose={onClose} />);
    await userEvent.keyboard('5');
    expect(screen.getAllByRole('radio')[4]).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await userEvent.keyboard('6');
    expect(screen.getAllByRole('radio')[4]).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('ignores missing options, modified keys and repeated keys', () => {
    render(<QuizSession artifact={artifact} onClose={onClose} />);
    const stage = screen.getByRole('dialog');
    fireEvent.keyDown(stage, { key: '5' });
    fireEvent.keyDown(stage, { key: '2', ctrlKey: true });
    fireEvent.keyDown(stage, { key: '2', repeat: true });
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.checkAnswer' })
    ).toBeDisabled();
  });

  it('suspends quiz keys while the exit confirmation owns focus', async () => {
    render(<QuizSession artifact={twoQuestionArtifact} onClose={onClose} />);
    await checkOption(0);
    await advance();
    await userEvent.keyboard('{Escape}');
    const keep = screen.getByRole('button', {
      name: 'ai.artifacts.focus.exit.keep',
    });
    fireEvent.keyDown(keep, { key: '2' });
    await userEvent.click(keep);
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.checkAnswer' })
    ).toBeDisabled();
  });

  it('keeps initial focus on the stage even under StrictMode', () => {
    render(
      <StrictMode>
        <QuizSession artifact={artifact} onClose={onClose} />
      </StrictMode>
    );
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(
      true
    );
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toHaveFocus();
    }
  });

  it('closes directly when a selection has not been checked', async () => {
    render(<QuizSession artifact={artifact} onClose={onClose} />);
    await userEvent.click(screen.getAllByRole('radio')[0]);
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.exitStudy' })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText('ai.artifacts.focus.exit.title')
    ).not.toBeInTheDocument();
  });

  it('focuses results, reviews each question, and submits a full run exactly once', async () => {
    const view = render(
      <StrictMode>
        <QuizSession artifact={twoQuestionArtifact} onClose={onClose} />
      </StrictMode>
    );
    await finishMixedRun();
    expect(
      screen.getByRole('heading', {
        name: 'ai.artifacts.quiz.results.headline {"score":1,"total":2}',
      })
    ).toHaveFocus();
    const rows = screen.getAllByRole('button', {
      name: /ai.artifacts.quiz.reviewRow/,
    });
    expect(rows).toHaveLength(1);
    await userEvent.click(rows[0]);
    await waitFor(() => expect(screen.getByText('A. Tres')).toBeVisible());
    expect(screen.getByText('B. Cuatro')).toBeVisible();
    expect(screen.getByText('Dos más dos son cuatro.')).toBeVisible();
    expect(screen.getAllByRole('progressbar')).toHaveLength(2);
    expect(mutateAsync).toHaveBeenCalledExactlyOnceWith({
      answers: [
        { questionIndex: 0, selectedIndex: 0 },
        { questionIndex: 1, selectedIndex: 0 },
      ],
      scope: 'full',
    });
    view.rerender(
      <StrictMode>
        <QuizSession artifact={twoQuestionArtifact} onClose={onClose} />
      </StrictMode>
    );
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it('retries only missed questions, submits original indexes with missed scope, and can restart fully', async () => {
    render(<QuizSession artifact={twoQuestionArtifact} onClose={onClose} />);
    await finishMixedRun();
    await userEvent.click(
      screen.getByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    );
    expect(screen.getByRole('radiogroup', { name: '¿Dos?' })).toBeVisible();
    expect(screen.getAllByRole('radio')[0]).toHaveFocus();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuemax',
      '1'
    );
    await checkOption(1);
    await advance();
    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutateAsync).toHaveBeenLastCalledWith({
      answers: [{ questionIndex: 1, selectedIndex: 1 }],
      scope: 'missed',
    });
    expect(screen.getByText('ai.artifacts.quiz.missedPractice')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.tryAgain' })
    );
    expect(screen.getByRole('radiogroup', { name: '¿Uno?' })).toBeVisible();
    expect(screen.getAllByRole('radio')[0]).toHaveFocus();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuemax',
      '2'
    );
    await finishMixedRun();
    expect(mutateAsync).toHaveBeenCalledTimes(3);
    expect(mutateAsync).toHaveBeenLastCalledWith({
      answers: [
        { questionIndex: 0, selectedIndex: 0 },
        { questionIndex: 1, selectedIndex: 0 },
      ],
      scope: 'full',
    });
  });

  it('hides retry on a perfect run and returns to the note without confirmation', async () => {
    render(<QuizSession artifact={artifact} onClose={onClose} />);
    await checkOption(1);
    await advance();
    expect(
      screen.getByRole('heading', {
        name: 'ai.artifacts.quiz.results.headline {"score":1,"total":1}',
      })
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', {
        name: 'ai.artifacts.flashcards.summary.toRevisit',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.backToNote' })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers note return and restart without chaining another missed-practice run', async () => {
    render(<QuizSession artifact={twoQuestionArtifact} onClose={onClose} />);
    await finishMixedRun();
    await userEvent.click(
      screen.getByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    );
    await checkOption(0);
    await advance();
    expect(mutateAsync).toHaveBeenLastCalledWith({
      answers: [{ questionIndex: 1, selectedIndex: 0 }],
      scope: 'missed',
    });
    expect(
      screen.queryByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'ai.artifacts.flashcards.summary.toRevisit',
      })
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.focus.backToNote' })
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.tryAgain' })
    ).toBeVisible();
  });

  it('offers retry only after the full run finishes saving', async () => {
    const submission = Promise.withResolvers<{ score: number }>();
    mutateAsync.mockReturnValueOnce(submission.promise);
    render(<QuizSession artifact={artifact} onClose={onClose} />);
    await checkOption(0);
    await advance();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    ).not.toBeInTheDocument();
    await act(async () => submission.resolve({ score: 0 }));
    expect(
      screen.getByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    ).toBeVisible();
  });

  it('does not reuse a previous full run save after restarting', async () => {
    render(<QuizSession artifact={artifact} onClose={onClose} />);
    await checkOption(0);
    await advance();
    expect(
      screen.getByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', {
        name: 'ai.artifacts.flashcards.summary.practiceOptions',
      })
    );
    await userEvent.click(
      await screen.findByRole('menuitem', {
        name: 'ai.artifacts.quiz.tryAgain',
      })
    );
    mutateAsync.mockRejectedValueOnce(new Error('Offline'));
    await checkOption(0);
    await advance();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('ai.artifacts.quiz.submitError')
    );
    expect(
      screen.queryByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    ).not.toBeInTheDocument();
  });

  it('ignores an earlier run save that finishes after restarting', async () => {
    const submission = Promise.withResolvers<{ score: number }>();
    mutateAsync.mockReturnValueOnce(submission.promise);
    render(<QuizSession artifact={artifact} onClose={onClose} />);
    await checkOption(0);
    await advance();
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.tryAgain' })
    );
    mutateAsync.mockRejectedValueOnce(new Error('Offline'));
    await checkOption(0);
    await advance();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('ai.artifacts.quiz.submitError')
    );
    await act(async () => submission.resolve({ score: 0 }));
    expect(
      screen.queryByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    ).not.toBeInTheDocument();
  });

  it('does not surface an earlier run failure after restarting', async () => {
    const submission = Promise.withResolvers<{ score: number }>();
    mutateAsync.mockReturnValueOnce(submission.promise);
    render(<QuizSession artifact={artifact} onClose={onClose} />);
    await checkOption(0);
    await advance();
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.tryAgain' })
    );
    await act(async () => submission.reject(new Error('Offline')));
    expect(toast.error).not.toHaveBeenCalled();
    expect(
      screen.getByRole('radiogroup', { name: '¿Capital de Francia?' })
    ).toBeVisible();
  });

  it('starts another one-question run with focus on its first option', async () => {
    render(<QuizSession artifact={artifact} onClose={onClose} />);
    await checkOption(1);
    await advance();
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.tryAgain' })
    );
    expect(screen.getAllByRole('radio')[0]).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.checkAnswer' })
    ).toBeDisabled();
  });

  it('lets read-only viewers retry a full run with misses without submitting', async () => {
    render(
      <QuizSession artifact={twoQuestionArtifact} onClose={onClose} readOnly />
    );
    await finishMixedRun();
    expect(
      screen.getByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    );
    await checkOption(0);
    await advance();
    expect(
      screen.getByRole('heading', {
        name: 'ai.artifacts.quiz.results.headline {"score":0,"total":1}',
      })
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'ai.artifacts.flashcards.summary.toRevisit',
      })
    ).toBeVisible();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('keeps results and the existing toast when saving fails without resubmitting on review', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('Offline'));
    render(<QuizSession artifact={artifact} onClose={onClose} />);
    await checkOption(0);
    await advance();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('ai.artifacts.quiz.submitError')
    );
    await userEvent.click(
      screen.getByRole('button', { name: /ai.artifacts.quiz.reviewRow/ })
    );
    expect(
      screen.getByRole('heading', {
        name: 'ai.artifacts.quiz.results.headline {"score":0,"total":1}',
      })
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'ai.artifacts.flashcards.summary.toRevisit',
      })
    ).toBeVisible();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it('settles the track on Check while remaining on the checked question', async () => {
    render(<QuizSession artifact={twoQuestionArtifact} onClose={onClose} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0'
    );
    expect(
      screen.getByRole('progressbar').querySelector('[data-state="current"]')
    ).toBeInTheDocument();
    await checkOption(0);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '1'
    );
    expect(
      screen.getByRole('progressbar').querySelector('[data-state="correct"]')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', { name: '¿Uno?' })
    ).toBeInTheDocument();
    await advance();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '1'
    );
    expect(
      screen.getByRole('radiogroup', { name: '¿Dos?' })
    ).toBeInTheDocument();
  });
});
