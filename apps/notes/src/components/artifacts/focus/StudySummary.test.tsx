import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StudySummary, type StudySummaryProps } from './StudySummary';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));
vi.mock('./SessionCelebration', () => ({
  SessionCelebration: () => <div data-testid="celebration" />,
}));

function summaryProps(): StudySummaryProps {
  return {
    headline: '2 / 3 recalled',
    duration: '0m 06s',
    segments: ['correct', 'wrong', 'correct'],
    legend: [
      { state: 'correct', label: 'recalled', count: 2 },
      { state: 'wrong', label: 'needs practice', count: 1 },
      { state: 'skipped', label: 'skipped', count: 0 },
    ],
    celebrate: false,
    revisit: (
      <section>
        <h3>To revisit</h3>
        <button type="button">Where does it happen?</button>
      </section>
    ),
    primaryAction: <button type="button">Practice missed (1)</button>,
    secondaryAction: <button type="button">Back to note</button>,
  };
}

describe('StudySummary', () => {
  it('focuses an outcome headline once and shows ordered hero history', async () => {
    const props = summaryProps();
    const { rerender } = render(<StudySummary {...props} />);
    const heading = screen.getByRole('heading', {
      level: 2,
      name: props.headline,
    });
    expect(heading).toHaveFocus();
    expect(heading).toHaveClass('tracking-tight', 'tabular-nums');
    const bar = screen.getByRole('progressbar', { name: props.headline });
    expect(bar).toHaveClass('h-3');
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(
      [...bar.querySelectorAll('[data-state]')].map((node) =>
        node.getAttribute('data-state')
      )
    ).toEqual(['correct', 'wrong', 'correct']);
    await userEvent.click(
      screen.getByRole('button', { name: 'Where does it happen?' })
    );
    rerender(<StudySummary {...props} />);
    expect(
      screen.getByRole('button', { name: 'Where does it happen?' })
    ).toHaveFocus();
  });

  it('keeps counts as text and renders primary before secondary', () => {
    render(<StudySummary {...summaryProps()} />);
    expect(screen.getByText('2 recalled')).toBeInTheDocument();
    expect(screen.getByText('1 needs practice')).toBeInTheDocument();
    expect(screen.getByText('0 skipped')).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveClass('font-normal', 'tabular-nums');
    expect(
      screen.getByText(
        'ai.artifacts.flashcards.summary.inTime {"duration":"0m 06s"}'
      )
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button').map((button) => button.textContent)
    ).toEqual(['Where does it happen?', 'Practice missed (1)', 'Back to note']);
    expect(screen.queryByTestId('celebration')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the milestone without an empty revisit section or invented time', () => {
    render(
      <StudySummary
        headline="1 / 1 correct"
        segments={['correct']}
        legend={[{ state: 'correct', label: 'correct', count: 1 }]}
        celebrate
        primaryAction={<button type="button">Practice again</button>}
      />
    );
    expect(screen.getByTestId('celebration')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    expect(screen.queryByText(/summary.inTime/)).not.toBeInTheDocument();
  });
});
