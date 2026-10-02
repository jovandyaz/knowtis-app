import { quotaStateOf } from '@/hooks/useAiQuota';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QuotaCounter } from './QuotaCounter';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) =>
      opts?.count === undefined ? key : `${key}(count=${opts.count})`,
  }),
}));

const RESETS_AT = '2026-10-03T00:00:00.000Z';

function freeQuota(used: number) {
  return quotaStateOf({
    tier: 'free',
    messages: { used, limit: 30, resetsAt: RESETS_AT },
  });
}

describe('QuotaCounter', () => {
  it('emphasizes the messages left once the day runs low', () => {
    render(<QuotaCounter quota={freeQuota(24)} />);

    const counter = screen.getByText('ai.copilot.quota.remaining(count=6)');
    expect(counter).toHaveClass('text-warning', 'font-medium');
    expect(counter).not.toHaveClass('text-muted-foreground');
  });

  it('stays quiet while plenty of messages are left', () => {
    render(<QuotaCounter quota={freeQuota(10)} />);

    const counter = screen.getByText('ai.copilot.quota.remaining(count=20)');
    expect(counter).toHaveClass('text-muted-foreground');
    expect(counter).not.toHaveClass('text-warning');
  });

  it('never counts below zero', () => {
    render(<QuotaCounter quota={freeQuota(31)} />);

    expect(
      screen.getByText('ai.copilot.quota.remaining(count=0)')
    ).toBeInTheDocument();
  });

  it.each([
    ['a byok caller', quotaStateOf({ tier: 'byok', messages: null })],
    ['an unknown quota', quotaStateOf(undefined)],
  ])('shows nothing for %s', (_, quota) => {
    const { container } = render(<QuotaCounter quota={quota} />);

    expect(container).toBeEmptyDOMElement();
  });
});
