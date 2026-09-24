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
});
