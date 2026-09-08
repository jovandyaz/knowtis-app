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

  it('tracks the question position on a progress bar', () => {
    render(<QuizSession artifact={artifact} />);

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '1');
  });

  it('parks the roving tabindex on the first option until one is picked', () => {
    render(<QuizSession artifact={artifact} />);

    const [first, second, third] = screen.getAllByRole('radio');
    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '-1');
    expect(third).toHaveAttribute('tabindex', '-1');
  });

  it('moves focus and selection to the next option on ArrowDown', async () => {
    render(<QuizSession artifact={artifact} />);

    screen.getByRole('radio', { name: /^A\.\s*Madrid$/ }).focus();
    await userEvent.keyboard('{ArrowDown}');

    const second = screen.getByRole('radio', { name: /^B\.\s*París$/ });
    expect(second).toHaveAttribute('aria-checked', 'true');
    expect(second).toHaveFocus();
  });

  it('wraps to the last option on ArrowUp from the first', async () => {
    render(<QuizSession artifact={artifact} />);

    screen.getByRole('radio', { name: /^A\.\s*Madrid$/ }).focus();
    await userEvent.keyboard('{ArrowUp}');

    expect(screen.getByRole('radio', { name: /^C\.\s*Roma$/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('announces the outcome and the correct answer once answered', async () => {
    render(<QuizSession artifact={artifact} />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();

    await userEvent.click(
      screen.getByRole('radio', { name: /^A\.\s*Madrid$/ })
    );

    expect(status.textContent).toContain('ai.artifacts.quiz.outcomeIncorrect');
    expect(status.textContent).toContain('"letter":"B"');
    expect(status.textContent).toContain('"answer":"París"');
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
    expect(bar.firstElementChild?.className).toContain('bg-(--primary)');
  });

  it('does not submit a read-only quiz', () => {
    render(<QuizSession artifact={twoQuestionArtifact} readOnly />);

    const [first] = screen.getAllByRole('radio');
    expect(first).toBeDisabled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
