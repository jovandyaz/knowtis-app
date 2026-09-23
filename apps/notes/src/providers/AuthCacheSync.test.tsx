import { authStore } from '@/auth';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthCacheSync } from './AuthCacheSync';

const { newConversation, cancelQueries, clear } = vi.hoisted(() => ({
  newConversation: vi.fn(),
  cancelQueries: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('@/auth', async () => {
  const { createStore } = await import('zustand/vanilla');
  return { authStore: createStore(() => ({ isAuthenticated: true })) };
});
vi.mock('@/lib/query-client', () => ({
  queryClient: { cancelQueries, clear },
}));
vi.mock('@/stores/agent.store', () => ({
  useAgentStore: { getState: () => ({ newConversation }) },
}));

describe('AuthCacheSync', () => {
  beforeEach(() => {
    authStore.setState({ isAuthenticated: true });
    vi.clearAllMocks();
  });

  it('forgets the copilot thread and the query cache when the session ends', () => {
    render(<AuthCacheSync />);

    act(() => authStore.setState({ isAuthenticated: false }));

    expect([
      cancelQueries.mock.calls.length,
      clear.mock.calls.length,
      newConversation.mock.calls.length,
    ]).toEqual([1, 1, 1]);
  });

  it('leaves both alone while the session lasts', () => {
    render(<AuthCacheSync />);

    act(() => authStore.setState({ isAuthenticated: true }));

    expect(newConversation).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
});
