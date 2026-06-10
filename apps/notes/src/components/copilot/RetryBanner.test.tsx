import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RetryBanner } from './RetryBanner';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('RetryBanner', () => {
  it('renders the message as an alert', () => {
    render(<RetryBanner message="Something failed" onRetry={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something failed');
  });

  it('invokes onRetry when the retry button is clicked', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<RetryBanner message="Something failed" onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'ai.preview.retry' }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
