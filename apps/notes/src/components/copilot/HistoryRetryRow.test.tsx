import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { HistoryRetryRow } from './HistoryRetryRow';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('HistoryRetryRow', () => {
  it('says the earlier messages did not load, without raising an alert', () => {
    render(<HistoryRetryRow onRetry={vi.fn()} />);

    expect(
      screen.getByText('ai.copilot.history.earlierFailed')
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retries from the keyboard', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<HistoryRetryRow onRetry={onRetry} />);

    await user.tab();
    expect(
      screen.getByRole('button', { name: 'ai.copilot.history.retry' })
    ).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows the retry in progress without letting it run twice', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<HistoryRetryRow onRetry={onRetry} busy />);

    const retry = screen.getByRole('button', { name: 'states.loading' });
    await user.click(retry);

    expect(retry).toHaveAttribute('aria-disabled', 'true');
    expect(retry).toHaveAttribute('aria-busy', 'true');
    expect(retry.querySelector('svg')).toHaveClass(
      'animate-spin',
      'motion-reduce:animate-none'
    );
    expect(onRetry).not.toHaveBeenCalled();
  });
});
