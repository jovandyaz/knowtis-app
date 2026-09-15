import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuizContent } from '@knowtis/shared-types';

import { QuizResults } from './QuizResults';
import type { QuizAnswerRecord } from './use-quiz-session';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));

const questions: QuizContent['questions'] = [
  {
    question: 'Capital of France?',
    options: ['Madrid', 'Paris'],
    correctIndex: 1,
    explanation: 'Paris is the capital.',
  },
  {
    question: 'Two plus two?',
    options: ['Three', 'Four'],
    correctIndex: 1,
    explanation: '',
  },
];
const answers: QuizAnswerRecord[] = [
  { questionIndex: 0, selectedIndex: 1, correct: true },
  { questionIndex: 1, selectedIndex: 0, correct: false },
];
const actions = {
  onBackToNote: vi.fn(),
  onRetryMissed: vi.fn(),
  onRestart: vi.fn(),
};

function renderResults(score = 1) {
  return render(
    <QuizResults
      score={score}
      total={2}
      scope="full"
      submissionSucceeded
      answers={answers}
      questions={questions}
      {...actions}
    />
  );
}

describe('QuizResults', () => {
  beforeEach(() => vi.clearAllMocks());

  it('focuses the results heading and describes every chart segment', () => {
    renderResults();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'ai.artifacts.quiz.completed',
      })
    ).toHaveFocus();
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'ai.artifacts.quiz.resultsDescription {"correct":1,"total":2,"incorrect":1,"percentage":50}'
    );
    expect(
      screen.getByRole('group', { name: 'ai.artifacts.quiz.correctCount' })
    ).toHaveTextContent('1');
    expect(
      screen.getByRole('group', { name: 'ai.artifacts.quiz.incorrectCount' })
    ).toHaveTextContent('1');
  });

  it('offers note return, retry-missed and full restart as separate actions', async () => {
    renderResults();
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.focus.backToNote' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.tryAgain' })
    );
    expect(actions.onBackToNote).toHaveBeenCalledTimes(1);
    expect(actions.onRetryMissed).toHaveBeenCalledTimes(1);
    expect(actions.onRestart).toHaveBeenCalledTimes(1);
  });

  it('shows all-correct instead of retry when the run has no misses', () => {
    render(
      <QuizResults
        score={1}
        total={1}
        scope="full"
        submissionSucceeded
        answers={answers.slice(0, 1)}
        questions={questions}
        {...actions}
      />
    );
    expect(
      screen.queryByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText('ai.artifacts.quiz.allCorrect')).toBeVisible();
  });

  it('reviews every answer in original order and expands one explanation at a time', async () => {
    renderResults();
    const rows = screen.getAllByRole('button', {
      name: /ai.artifacts.quiz.reviewRow/,
    });
    expect(rows.map((row) => row.textContent)).toEqual([
      'ai.artifacts.quiz.reviewRow {"n":1,"outcome":"ai.artifacts.quiz.outcomeRowCorrect"}',
      'ai.artifacts.quiz.reviewRow {"n":2,"outcome":"ai.artifacts.quiz.outcomeRowIncorrect"}',
    ]);
    expect(rows[0]).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(rows[0]);
    expect(rows[0]).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() =>
      expect(screen.getByText('Capital of France?')).toBeVisible()
    );
    expect(screen.getByText('Paris is the capital.')).toBeVisible();
    await userEvent.click(rows[1]);
    expect(rows[0]).toHaveAttribute('aria-expanded', 'false');
    expect(rows[1]).toHaveAttribute('aria-expanded', 'true');
    const region = screen.getByRole('region', {
      name: rows[1].textContent ?? '',
    });
    await waitFor(() =>
      expect(within(region).getByText('A. Three')).toBeVisible()
    );
    expect(within(region).getByText('B. Four')).toBeVisible();
    expect(
      within(region).getByText('ai.artifacts.quiz.yourAnswer')
    ).toBeVisible();
    expect(
      within(region).getByText('ai.artifacts.quiz.correctAnswer')
    ).toBeVisible();
    expect(
      within(region).queryByText('ai.artifacts.quiz.explanation')
    ).not.toBeInTheDocument();
    await userEvent.click(rows[1]);
    await waitFor(() =>
      expect(screen.queryByText('Two plus two?')).not.toBeInTheDocument()
    );
  });

  it('labels a missed run and keeps its original question number', () => {
    render(
      <QuizResults
        score={0}
        total={1}
        scope="missed"
        submissionSucceeded
        answers={answers.slice(1)}
        questions={questions}
        {...actions}
      />
    );
    expect(screen.getByText('ai.artifacts.quiz.missedPractice')).toBeVisible();
    expect(
      screen.getByRole('button', { name: /ai.artifacts.quiz.reviewRow/ })
    ).toHaveTextContent('"n":2');
    expect(
      screen.queryByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('ai.artifacts.quiz.allCorrect')
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.focus.backToNote' })
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.tryAgain' })
    ).toBeVisible();
  });
});
