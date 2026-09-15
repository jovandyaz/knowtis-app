import { render, screen, within } from '@testing-library/react';
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
vi.mock('../focus/SessionCelebration', () => ({
  SessionCelebration: () => <div data-testid="celebration" />,
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

function renderResults() {
  return render(
    <QuizResults
      score={1}
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

  it('focuses the score headline and preserves ordered outcomes in the hero', () => {
    renderResults();
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveAccessibleName(
      'ai.artifacts.quiz.results.headline {"score":1,"total":2}'
    );
    expect(heading).toHaveFocus();
    const hero = screen.getByRole('progressbar');
    expect(hero).toHaveClass('h-3');
    expect(
      [...hero.querySelectorAll('[data-state]')].map((node) =>
        node.getAttribute('data-state')
      )
    ).toEqual(['correct', 'wrong']);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(/quiz\.accuracy/)).not.toBeInTheDocument();
  });

  it('reviews only misses and keeps their original question identity', async () => {
    renderResults();
    expect(
      screen.getByRole('heading', {
        name: 'ai.artifacts.flashcards.summary.toRevisit',
      })
    ).toBeInTheDocument();
    const row = screen.getByRole('button', {
      name: /ai.artifacts.quiz.reviewRow/,
    });
    expect(row).toHaveTextContent('"n":2');
    await userEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    const region = screen.getByRole('region', {
      name: row.textContent ?? '',
    });
    expect(await within(region).findByText('Two plus two?')).toBeVisible();
    expect(within(region).getByText('A. Three')).toBeVisible();
    expect(within(region).getByText('B. Four')).toBeVisible();
    expect(screen.queryByText('Capital of France?')).not.toBeInTheDocument();
  });

  it.each([
    { scope: 'full' as const, readOnly: false, saved: false, retry: false },
    { scope: 'full' as const, readOnly: false, saved: true, retry: true },
    { scope: 'full' as const, readOnly: true, saved: false, retry: true },
    { scope: 'missed' as const, readOnly: false, saved: true, retry: false },
  ])(
    'retains retry eligibility for $scope/readOnly=$readOnly/saved=$saved',
    ({ scope, readOnly, saved, retry }) => {
      render(
        <QuizResults
          score={1}
          total={2}
          scope={scope}
          readOnly={readOnly}
          submissionSucceeded={saved}
          answers={answers}
          questions={questions}
          {...actions}
        />
      );
      expect(
        screen.queryByRole('button', {
          name: /ai.artifacts.quiz.retryMissed/,
        }) !== null
      ).toBe(retry);
      if (!retry) {
        expect(
          screen.getByRole('button', { name: 'ai.artifacts.quiz.tryAgain' })
        ).toBeInTheDocument();
      }
    }
  );

  it('celebrates only a nonempty perfect quiz and omits the revisit list', () => {
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
    expect(screen.getByTestId('celebration')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /quiz.retryMissed/ })
    ).not.toBeInTheDocument();
  });

  it('does not celebrate a mixed run or show an invented duration', () => {
    renderResults();
    expect(screen.queryByTestId('celebration')).not.toBeInTheDocument();
    expect(screen.queryByText(/summary\.inTime/)).not.toBeInTheDocument();
  });

  it('keeps full restart in the practice menu when retry is primary', async () => {
    renderResults();
    await userEvent.click(
      screen.getByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    );
    expect(actions.onRetryMissed).toHaveBeenCalledTimes(1);
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
    expect(actions.onRestart).toHaveBeenCalledTimes(1);
  });

  it('includes the explanation for an incorrect answer without refocusing the headline', async () => {
    render(
      <QuizResults
        score={0}
        total={1}
        scope="full"
        submissionSucceeded
        answers={[{ questionIndex: 0, selectedIndex: 0, correct: false }]}
        questions={questions}
        {...actions}
      />
    );
    const row = screen.getByRole('button', {
      name: /ai.artifacts.quiz.reviewRow/,
    });
    await userEvent.click(row);
    expect(await screen.findByText('Paris is the capital.')).toBeVisible();
    expect(screen.getByText('A. Madrid')).toBeVisible();
    expect(screen.getByText('B. Paris')).toBeVisible();
    expect(row).toHaveFocus();
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
      screen.queryByRole('button', {
        name: /ai.artifacts.quiz.retryMissed/,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.focus.backToNote' })
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'ai.artifacts.quiz.tryAgain' })
    ).toBeVisible();
  });

  it('keeps focus on the primary action when saving unlocks retry', () => {
    const view = render(
      <QuizResults
        score={1}
        total={2}
        scope="full"
        submissionSucceeded={false}
        answers={answers}
        questions={questions}
        {...actions}
      />
    );
    screen.getByRole('button', { name: 'ai.artifacts.quiz.tryAgain' }).focus();
    view.rerender(
      <QuizResults
        score={1}
        total={2}
        scope="full"
        submissionSucceeded
        answers={answers}
        questions={questions}
        {...actions}
      />
    );
    expect(
      screen.getByRole('button', { name: /ai.artifacts.quiz.retryMissed/ })
    ).toHaveFocus();
  });
});
