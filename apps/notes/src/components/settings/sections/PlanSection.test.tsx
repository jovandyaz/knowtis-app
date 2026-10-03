import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiQuota } from '@knowtis/shared-types';

import { PlanSection } from './PlanSection';

const quotaData = vi.fn<() => AiQuota | undefined>();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/hooks/useAiQuota', () => ({
  useAiQuota: () => ({ data: quotaData() }),
}));
vi.mock('../../copilot/TierBadge', () => ({
  TierBadge: () => <span>tier-badge</span>,
}));

const FREE: AiQuota = {
  tier: 'free',
  messages: { used: 3, limit: 30, resetsAt: '2026-10-04T00:00:00.000Z' },
};
const BYOK: AiQuota = { tier: 'byok', messages: null };

function tiers() {
  return screen.getAllByRole('listitem');
}

function currentTiers() {
  return tiers().filter((tier) => tier.getAttribute('aria-current') === 'true');
}

describe('PlanSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quotaData.mockReturnValue(FREE);
  });

  it('explains the three tiers in order, with who pays for each', () => {
    render(<PlanSection />);

    expect(
      tiers().map((tier) => within(tier).getByRole('heading').textContent)
    ).toEqual([
      'ai.copilot.quota.tier.anonymous',
      'ai.copilot.quota.tier.free',
      'ai.copilot.quota.tier.byok',
    ]);
    expect(tiers().map((tier) => tier.textContent)).toEqual([
      expect.stringMatching(
        /ai\.plan\.includes\.anonymous.*ai\.plan\.pays\.platform/
      ),
      expect.stringMatching(
        /ai\.plan\.includes\.free.*ai\.plan\.pays\.platform/
      ),
      expect.stringMatching(/ai\.plan\.includes\.byok.*ai\.plan\.pays\.key/),
    ]);
  });

  it.each([
    ['free', FREE, 'ai.copilot.quota.tier.free'],
    ['byok', BYOK, 'ai.copilot.quota.tier.byok'],
  ])(
    'marks a %s caller’s tier as theirs, with today’s badge',
    (_tier, quota, name) => {
      quotaData.mockReturnValue(quota);

      render(<PlanSection />);

      const [current, ...others] = currentTiers();
      expect(others).toEqual([]);
      expect(current).toHaveTextContent(name);
      expect(current).toHaveTextContent('ai.plan.current');
      expect(current).toHaveTextContent('tier-badge');
      expect(screen.getAllByText('tier-badge')).toHaveLength(1);
    }
  );

  it('marks no tier while today’s quota is unknown', () => {
    quotaData.mockReturnValue(undefined);

    render(<PlanSection />);

    expect(tiers()).toHaveLength(3);
    expect(currentTiers()).toEqual([]);
    expect(screen.queryByText('tier-badge')).not.toBeInTheDocument();
    expect(screen.queryByText('ai.plan.current')).not.toBeInTheDocument();
  });
});
