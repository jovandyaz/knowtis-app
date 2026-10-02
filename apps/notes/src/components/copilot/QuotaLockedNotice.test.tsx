import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { aiQuotaQueryKeys } from '@/hooks/useAiQuota';
import { clockTimeOf } from '@/lib/format-date';
import { useSettingsStore } from '@/stores/settings.store';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QuotaLockedNotice } from './QuotaLockedNotice';

const { navigate, captureProductEvent } = vi.hoisted(() => ({
  navigate: vi.fn(),
  captureProductEvent: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts
        ? `${key}(${Object.entries(opts)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(',')})`
        : key,
    i18n: { language: 'en' },
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}));
vi.mock('@/lib/analytics/product-events', () => ({ captureProductEvent }));

const RESETS_AT = new Date(2026, 9, 3).toISOString();
const MINUTE_BEFORE_RESET = new Date(Date.parse(RESETS_AT) - 60_000);
const RESETS_AT_ONE = new Date(2026, 9, 3, 1).toISOString();

function renderNotice(node: ReactNode) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { invalidate, ...render(node, { wrapper }) };
}

describe('QuotaLockedNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      isOpen: false,
      activeSection: 'profile',
      focusTarget: null,
    });
  });

  it('says how many messages were used and when they reset, in local time', () => {
    renderNotice(
      <QuotaLockedNotice tier="free" limit={30} resetsAt={RESETS_AT} />
    );

    const { time } = clockTimeOf(RESETS_AT, 'en');
    expect(time).toMatch(/\d{1,2}:\d{2}/);
    expect(screen.getByRole('status')).toHaveTextContent(
      `ai.copilot.quota.exhausted(count=30,time=${time})`
    );
  });

  it('still says when the messages reset when only the refusal is known', () => {
    renderNotice(
      <QuotaLockedNotice tier="free" limit={null} resetsAt={RESETS_AT} />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      `ai.copilot.quota.exhaustedToday(time=${clockTimeOf(RESETS_AT, 'en').time})`
    );
  });

  it('names a reset at one o’clock in its own form', () => {
    const { time } = clockTimeOf(RESETS_AT_ONE, 'en');
    const { rerender } = renderNotice(
      <QuotaLockedNotice tier="free" limit={30} resetsAt={RESETS_AT_ONE} />
    );
    const spent = screen.getByRole('status').textContent;

    rerender(
      <QuotaLockedNotice tier="free" limit={null} resetsAt={RESETS_AT_ONE} />
    );

    expect([spent, screen.getByRole('status').textContent]).toEqual([
      `ai.copilot.quota.exhausted(count=30,time=${time},context=atOne)`,
      `ai.copilot.quota.exhaustedToday(time=${time},context=atOne)`,
    ]);
  });

  it('reads the notice out with its call to action', () => {
    renderNotice(
      <QuotaLockedNotice tier="free" limit={30} resetsAt={RESETS_AT} />
    );

    expect(
      screen.getByRole('button', { name: 'ai.copilot.quota.byokCta' })
    ).toHaveAccessibleDescription(
      `ai.copilot.quota.exhausted(count=30,time=${clockTimeOf(RESETS_AT, 'en').time})`
    );
  });

  it('sends a guest to create a free account', async () => {
    const user = userEvent.setup();
    renderNotice(
      <QuotaLockedNotice tier="anonymous" limit={5} resetsAt={RESETS_AT} />
    );

    await user.click(
      screen.getByRole('button', { name: 'ai.copilot.quota.registerCta' })
    );

    expect(navigate).toHaveBeenCalledWith({ to: '/register' });
    expect(captureProductEvent).toHaveBeenCalledWith('ai upgrade cta clicked', {
      from_tier: 'anonymous',
      cta: 'register',
    });
    expect(useSettingsStore.getState().isOpen).toBe(false);
  });

  it('opens the API keys settings for a free account', async () => {
    const user = userEvent.setup();
    renderNotice(
      <QuotaLockedNotice tier="free" limit={30} resetsAt={RESETS_AT} />
    );

    await user.click(
      screen.getByRole('button', { name: 'ai.copilot.quota.byokCta' })
    );

    expect(useSettingsStore.getState()).toMatchObject({
      isOpen: true,
      activeSection: 'aiAssistant',
      focusTarget: 'aiKeys',
    });
    expect(captureProductEvent).toHaveBeenCalledWith('ai upgrade cta clicked', {
      from_tier: 'free',
      cta: 'byok',
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  describe('at the reset', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('reads the quota again once the messages reset', () => {
      vi.useFakeTimers();
      vi.setSystemTime(MINUTE_BEFORE_RESET);
      const { invalidate } = renderNotice(
        <QuotaLockedNotice tier="free" limit={30} resetsAt={RESETS_AT} />
      );

      act(() => {
        vi.advanceTimersByTime(59_999);
      });
      expect(invalidate).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: aiQuotaQueryKeys.all,
      });
    });

    it('keeps reading the quota past the reset while the server still reports the old day', () => {
      vi.useFakeTimers();
      vi.setSystemTime(MINUTE_BEFORE_RESET);
      const { invalidate } = renderNotice(
        <QuotaLockedNotice tier="free" limit={30} resetsAt={RESETS_AT} />
      );
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(invalidate).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(4_999);
      });
      expect(invalidate).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(invalidate).toHaveBeenCalledTimes(2);
    });

    it('waits the floor between reads when the reset time cannot be read', () => {
      vi.useFakeTimers();
      const { invalidate } = renderNotice(
        <QuotaLockedNotice tier="free" limit={30} resetsAt="not-a-date" />
      );

      act(() => {
        vi.advanceTimersByTime(4_999);
      });
      expect(invalidate).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(invalidate).toHaveBeenCalledTimes(1);
    });

    it('stops waiting once the lock lifts', () => {
      vi.useFakeTimers();
      vi.setSystemTime(MINUTE_BEFORE_RESET);
      const { invalidate, unmount } = renderNotice(
        <QuotaLockedNotice tier="free" limit={30} resetsAt={RESETS_AT} />
      );

      unmount();
      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      expect(invalidate).not.toHaveBeenCalled();
    });
  });
});
