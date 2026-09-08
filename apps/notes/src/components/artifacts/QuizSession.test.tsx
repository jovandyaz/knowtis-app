import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuizArtifact } from '@knowtis/shared-types';

import { QuizSession } from './QuizSession';

const mutateAsync = vi.fn().mockResolvedValue({ score: 1 });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts ? `${k} ${JSON.stringify(opts)}` : k,
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@knowtis/data-access-artifacts', () => ({
  useSubmitQuiz: () => ({ mutateAsync, isPending: false }),
}));

const artifact = {
  id: 'quiz-1',
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
} as unknown as QuizArtifact;

const twoQuestionArtifact = {
  id: 'quiz-2',
  content: {
    questions: [
      { question: '¿Uno?', options: ['Uno', 'Dos'], correctIndex: 0 },
      { question: '¿Dos?', options: ['Tres', 'Cuatro'], correctIndex: 1 },
    ],
  },
} as unknown as QuizArtifact;

describe('QuizSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes the answers as a radio group named by the question', () => {
    render(<QuizSession artifact={artifact} />);

    expect(
      screen.getByRole('radiogroup', { name: '¿Capital de Francia?' })
    ).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(radio).toHaveAttribute('aria-checked', 'false');
    }
  });

  it('marks the picked answer as checked once answered', async () => {
    render(<QuizSession artifact={artifact} />);

    await userEvent.click(screen.getByRole('radio', { name: /París/ }));

    expect(screen.getByRole('radio', { name: /París/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('radio', { name: /Madrid/ })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('tracks the answers given on a progress bar, not the question reached', async () => {
    render(<QuizSession artifact={twoQuestionArtifact} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAccessibleName(
      'ai.artifacts.quiz.answeredOf {"answered":0,"total":2}'
    );
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '2');

    await userEvent.click(screen.getByRole('radio', { name: /^A\.\s*Uno$/ }));

    expect(bar).toHaveAttribute('aria-valuenow', '1');
  });

  it('keeps the question position as the visible caption', () => {
    render(<QuizSession artifact={twoQuestionArtifact} />);

    expect(
      screen.getByText('ai.artifacts.quiz.questionOf {"current":1,"total":2}')
    ).toBeInTheDocument();
  });

  it('parks the roving tabindex on the first option before any movement', () => {
    render(<QuizSession artifact={artifact} />);

    const [first, second, third] = screen.getAllByRole('radio');
    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '-1');
    expect(third).toHaveAttribute('tabindex', '-1');
  });

  it('moves focus to the next option on ArrowDown without picking it', async () => {
    render(<QuizSession artifact={artifact} />);

    screen.getByRole('radio', { name: /^A\.\s*Madrid$/ }).focus();
    await userEvent.keyboard('{ArrowDown}');

    const second = screen.getByRole('radio', { name: /^B\.\s*París$/ });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('tabindex', '0');
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveAttribute('aria-checked', 'false');
    }
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('wraps focus to the last option on ArrowUp from the first', async () => {
    render(<QuizSession artifact={artifact} />);

    screen.getByRole('radio', { name: /^A\.\s*Madrid$/ }).focus();
    await userEvent.keyboard('{ArrowUp}');

    const third = screen.getByRole('radio', { name: /^C\.\s*Roma$/ });
    expect(third).toHaveFocus();
    expect(third).toHaveAttribute('aria-checked', 'false');
  });

  it('answers the focused option on Enter', async () => {
    render(<QuizSession artifact={artifact} />);

    screen.getByRole('radio', { name: /^A\.\s*Madrid$/ }).focus();
    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(
      screen.getByRole('radio', { name: /^B\.\s*París$/ })
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('moves focus to the advance button once an answer is picked', async () => {
    render(<QuizSession artifact={twoQuestionArtifact} />);

    await userEvent.click(screen.getByRole('radio', { name: /^A\.\s*Uno$/ }));

    expect(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.next' })
    ).toHaveFocus();
  });

  it('moves focus back to the first option after advancing', async () => {
    render(<QuizSession artifact={twoQuestionArtifact} />);

    await userEvent.click(screen.getByRole('radio', { name: /^A\.\s*Uno$/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.next' })
    );

    const [first] = screen.getAllByRole('radio');
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute('tabindex', '0');
  });

  it('moves focus to the results heading once the quiz is finished', async () => {
    render(<QuizSession artifact={twoQuestionArtifact} />);

    await userEvent.click(screen.getByRole('radio', { name: /^A\.\s*Uno$/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.next' })
    );
    await userEvent.click(screen.getByRole('radio', { name: /^A\.\s*Tres$/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.finish' })
    );

    const heading = screen.getByRole('heading', {
      name: 'ai.artifacts.quiz.completed',
    });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute('tabindex', '-1');
  });

  it('returns focus to the first option after restarting a one-question quiz', async () => {
    const oneQuestionArtifact = {
      ...twoQuestionArtifact,
      content: {
        ...twoQuestionArtifact.content,
        questions: [twoQuestionArtifact.content.questions[0]],
      },
    } as unknown as QuizArtifact;
    render(<QuizSession artifact={oneQuestionArtifact} />);

    await userEvent.click(screen.getByRole('radio', { name: /^A\.\s*Uno$/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.finish' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.tryAgain' })
    );

    const [first] = screen.getAllByRole('radio');
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute('tabindex', '0');
  });

  it('keeps the advance button mounted and disabled until an answer is picked', () => {
    render(<QuizSession artifact={twoQuestionArtifact} />);

    expect(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.next' })
    ).toBeDisabled();
  });

  it('announces the outcome and the correct answer once answered', async () => {
    render(<QuizSession artifact={artifact} />);

    const status = screen.getByRole('status');
    expect(status).not.toHaveAttribute('aria-live');
    expect(status).toBeEmptyDOMElement();

    await userEvent.click(
      screen.getByRole('radio', { name: /^A\.\s*Madrid$/ })
    );

    expect(status.textContent).toContain('ai.artifacts.quiz.outcomeIncorrect');
    expect(status.textContent).toContain('"letter":"B"');
    expect(status.textContent).toContain('"answer":"París"');
  });

  it('reveals the right answer without checking a second radio', async () => {
    render(<QuizSession artifact={artifact} />);

    await userEvent.click(
      screen.getByRole('radio', { name: /^A\.\s*Madrid$/ })
    );

    const revealed = screen.getByRole('radio', { name: /^B\.\s*París$/ });
    expect(revealed).toHaveAttribute('data-state', 'correct');
    expect(revealed).toHaveAttribute('aria-checked', 'false');
    expect(
      screen.getByRole('radio', { name: /^A\.\s*Madrid$/ })
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('announces a correct pick with its letter', async () => {
    render(<QuizSession artifact={artifact} />);

    await userEvent.click(screen.getByRole('radio', { name: /^B\.\s*París$/ }));

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('ai.artifacts.quiz.outcomeCorrect');
    expect(status.textContent).toContain('"letter":"B"');
  });

  it('submits one answer per question when the quiz is finished', async () => {
    render(<QuizSession artifact={twoQuestionArtifact} />);

    await userEvent.click(screen.getByRole('radio', { name: /^A\.\s*Uno$/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.next' })
    );
    await userEvent.click(screen.getByRole('radio', { name: /^A\.\s*Tres$/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.finish' })
    );

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        answers: [
          { questionIndex: 0, selectedIndex: 0 },
          { questionIndex: 1, selectedIndex: 0 },
        ],
      })
    );
  });

  it('scores the finished quiz on a progress bar', async () => {
    render(<QuizSession artifact={twoQuestionArtifact} />);

    await userEvent.click(screen.getByRole('radio', { name: /^A\.\s*Uno$/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.next' })
    );
    await userEvent.click(screen.getByRole('radio', { name: /^A\.\s*Tres$/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.finish' })
    );

    const bar = await screen.findByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar.firstElementChild).toHaveClass('bg-(--primary)');
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.tryAgain' })
    ).toHaveClass('min-h-11');
  });

  it('gives the advance button a 44px touch target', () => {
    render(<QuizSession artifact={twoQuestionArtifact} />);

    expect(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.next' })
    ).toHaveClass('min-h-11');
  });

  it('lets a read-only viewer practise the whole quiz without submitting it', async () => {
    render(<QuizSession artifact={twoQuestionArtifact} readOnly />);

    const [first] = screen.getAllByRole('radio');
    expect(first).toBeEnabled();

    await userEvent.click(screen.getByRole('radio', { name: /^A\.\s*Uno$/ }));
    expect(screen.getByRole('status').textContent).toContain(
      'ai.artifacts.quiz.outcomeCorrect'
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.next' })
    );
    await userEvent.click(screen.getByRole('radio', { name: /^A\.\s*Tres$/ }));
    const finish = screen.getByRole('button', {
      name: 'ai.artifacts.quiz.finish',
    });
    expect(finish).toBeEnabled();

    await userEvent.click(finish);

    expect(
      await screen.findByText('ai.artifacts.quiz.completed')
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
