import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentClient, aiQuotaApi } from '@knowtis/api-client';
import type { AiQuota } from '@knowtis/shared-types';

import {
  aiQuotaQueryKeys,
  quotaStateOf,
  useAiQuota,
  useAiQuotaSync,
  type QuotaState,
} from './useAiQuota';

const { authUser, authStore } = vi.hoisted(() => {
  const authUser = vi.fn<() => { id: string } | null>();
  return {
    authUser,
    authStore: { getState: () => ({ user: authUser() }) },
  };
});

vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => authUser(),
  useAuthStore: () => authStore,
}));
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

const USER_A = { id: 'user-a' };
const USER_B = { id: 'user-b' };

beforeEach(() => {
  vi.clearAllMocks();
  authUser.mockReturnValue(USER_A);
});

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

  it("does not serve one user's cached quota to the user who signs in next", async () => {
    const spentAsGuest = metered('anonymous', 5, 5);
    const freshAccount = metered('free', 0, 30);
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValueOnce(spentAsGuest);
    const { result, rerender } = renderWithClient(() => useAiQuota());
    await waitFor(() => expect(result.current.data).toEqual(spentAsGuest));
    vi.mocked(aiQuotaApi.getQuota).mockResolvedValueOnce(freshAccount);

    authUser.mockReturnValue(USER_B);
    rerender();

    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toEqual(freshAccount));
  });
});

describe('useAiQuotaSync', () => {
  const unsubscribe = vi.fn();

  function subscribe() {
    let listener: ((quota: AiQuota) => void) | undefined;
    vi.mocked(agentClient.onQuota).mockImplementation((next) => {
      listener = next;
      return unsubscribe;
    });
    const rendered = renderWithClient(() => useAiQuotaSync());
    const push = (quota: AiQuota) => {
      if (!listener) {
        throw new Error('no quota listener subscribed');
      }
      listener(quota);
    };
    return { ...rendered, push };
  }

  it('writes each pushed quota into the cache and unsubscribes on unmount', () => {
    const { client, push, unmount } = subscribe();
    const quota = metered('anonymous', 4, 5);

    push(quota);

    expect(client.getQueryData(aiQuotaQueryKeys.forUser(USER_A.id))).toEqual(
      quota
    );
    expect(unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('files a push under the user signed in when it arrives', () => {
    const { client, push } = subscribe();
    const quota = metered('free', 1, 30);

    authUser.mockReturnValue(USER_B);
    push(quota);

    expect(client.getQueryData(aiQuotaQueryKeys.forUser(USER_B.id))).toEqual(
      quota
    );
    expect(
      client.getQueryData(aiQuotaQueryKeys.forUser(USER_A.id))
    ).toBeUndefined();
  });

  it('drops a push that arrives while nobody is signed in', () => {
    const { client, push } = subscribe();

    authUser.mockReturnValue(null);
    push(metered('anonymous', 1, 5));

    expect(
      client.getQueryCache().findAll({ queryKey: aiQuotaQueryKeys.all })
    ).toEqual([]);
  });
});
