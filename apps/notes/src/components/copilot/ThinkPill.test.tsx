import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ThinkPill } from './ThinkPill';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ThinkPill', () => {
  it('renders an unpressed pill that reports the toggle', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<ThinkPill active={false} onToggle={onToggle} hidden={false} />);

    const pill = screen.getByRole('button', { name: 'aiAssistant.think' });
    expect(pill).toHaveAttribute('aria-pressed', 'false');
    expect(pill).toHaveAttribute('title', 'aiAssistant.thinkHint');

    await user.click(pill);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('marks the pill pressed while active', () => {
    render(<ThinkPill active onToggle={vi.fn()} hidden={false} />);

    expect(
      screen.getByRole('button', { name: 'aiAssistant.think' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders nothing when hidden', () => {
    render(<ThinkPill active={false} onToggle={vi.fn()} hidden />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
