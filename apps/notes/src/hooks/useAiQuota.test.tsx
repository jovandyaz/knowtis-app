import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentClient, aiQuotaApi } from '@knowtis/api-client';
import type { AiQuota } from '@knowtis/shared-types';

import {
  aiQuotaQueryKey,
  quotaStateOf,
  useAiQuota,
  useAiQuotaSync,
  type QuotaState,
} from './useAiQuota';

const { authUser } = vi.hoisted(() => ({
  authUser: vi.fn<() => { id: string } | null>(() => ({ id: 'user-1' })),
}));

vi.mock('@jovandyaz/auth-react', () => ({ useAuthUser: () => authUser() }));
vi.mock('@knowtis/api-client', () => ({
  aiQuotaApi: { getQuota: vi.fn() },
  agentClient: { onQuota: vi.fn() },
}));

const RESETS_AT = '2026-10-03T00:00:00.000Z';

function metered(
  tier: 'anonymous' | 'free',
  used: number,
  limit: number
): AiQuota {
  return { tier, messages: { used, limit, resetsAt: RESETS_AT } };
}

function renderWithClient<T>(hook: () => T) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(hook, { wrapper }) };
}

describe('quotaStateOf', () => {
  it.each<[string, AiQuota | undefined, QuotaState]>([
    ['nothing loaded', undefined, { kind: 'unknown' }],
    [
      'a byok caller',
      { tier: 'byok', messages: null },
      { kind: 'unmetered', tier: 'byok' },
    ],
    [
      'free 24/30, six left',
      metered('free', 24, 30),
      {
        kind: 'metered',
        tier: 'free',
        used: 24,
        limit: 30,
        resetsAt: RESETS_AT,
        low: true,
        exhausted: false,
      },
    ],
    [
      'free 23/30, seven left',
      metered('free', 23, 30),
      {
        kind: 'metered',
        tier: 'free',
        used: 23,
        limit: 30,
        resetsAt: RESETS_AT,
        low: false,
        exhausted: false,
      },
    ],
  ])('%s', (_case, quota, expected) => {
    expect(quotaStateOf(quota)).toEqual(expected);
  });

  it.each<[string, AiQuota]>([
    ['free 30/30', metered('free', 30, 30)],
    ['anonymous 5/5', metered('anonymous', 5, 5)],
    ['a limit of zero', metered('free', 0, 0)],
  ])('%s is exhausted', (_case, quota) => {
    expect(quotaStateOf(quota)).toMatchObject({
      kind: 'metered',
      exhausted: true,
    });
  });

  it('is unknown for a metered tier that came without its messages', () => {
    expect(quotaStateOf({ tier: 'free', messages: null })).toEqual({
      kind: 'unknown',
    });
  });
});

describe('useAiQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authUser.mockReturnValue({ id: 'user-1' });
  });

  it('reads the quota for a session user', async () => {
    const quota = metered('free', 3, 30);
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValue(quota);

    const { result } = renderWithClient(() => useAiQuota());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(quota);
  });

  it('does not ask without a session user', () => {
    authUser.mockReturnValue(null);

    const { result } = renderWithClient(() => useAiQuota());

    expect(result.current.fetchStatus).toBe('idle');
    expect(aiQuotaApi.getQuota).not.toHaveBeenCalled();
  });
});

describe('useAiQuotaSync', () => {
  it('writes each pushed quota into the cache and unsubscribes on unmount', () => {
    let push: ((quota: AiQuota) => void) | undefined;
    const unsubscribe = vi.fn();
    vi.mocked(agentClient.onQuota).mockImplementation((listener) => {
      push = listener;
      return unsubscribe;
    });
    const { client, unmount } = renderWithClient(() => useAiQuotaSync());
    const quota = metered('anonymous', 4, 5);

    push?.(quota);

    expect(client.getQueryData(aiQuotaQueryKey)).toEqual(quota);
    expect(unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
