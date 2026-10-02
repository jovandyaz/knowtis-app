import { authStore } from '@/auth';
import type * as AgentStore from '@/stores/agent.store';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentClient, aiClient } from '@knowtis/api-client';

import { AuthCacheSync } from './AuthCacheSync';

const { newConversation, cancelQueries, clear } = vi.hoisted(() => ({
  newConversation: vi.fn(),
  cancelQueries: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('@/auth', async () => {
  const { createStore } = await import('zustand/vanilla');
  return {
    authStore: createStore(() => ({
      isAuthenticated: true,
      user: null as { id: string; isAnonymous?: boolean } | null,
    })),
  };
});
vi.mock('@knowtis/api-client', () => ({
  agentClient: { disconnect: vi.fn() },
  aiClient: { disconnect: vi.fn() },
}));
vi.mock('@/lib/query-client', () => ({
  queryClient: { cancelQueries, clear },
}));
vi.mock('@/stores/agent.store', async (importOriginal) => ({
  ...(await importOriginal<typeof AgentStore>()),
  useAgentStore: { getState: () => ({ newConversation }) },
}));

const profile = (id: string) => ({
  id,
  email: `${id}@example.com`,
  name: id,
  avatarUrl: null,
});

const guest = (id: string) => ({ ...profile(id), isAnonymous: true });

describe('AuthCacheSync', () => {
  beforeEach(() => {
    authStore.setState({ isAuthenticated: true, user: profile('a') });
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

  it('drops both sockets when the session ends', () => {
    render(<AuthCacheSync />);

    act(() => authStore.setState({ isAuthenticated: false, user: null }));

    expect([
      vi.mocked(agentClient.disconnect).mock.calls.length,
      vi.mocked(aiClient.disconnect).mock.calls.length,
    ]).toEqual([1, 1]);
  });

  it('drops both sockets and the thread when another user signs in', () => {
    render(<AuthCacheSync />);

    act(() => authStore.setState({ user: profile('b') }));

    expect([
      vi.mocked(agentClient.disconnect).mock.calls.length,
      vi.mocked(aiClient.disconnect).mock.calls.length,
      newConversation.mock.calls.length,
    ]).toEqual([1, 1, 1]);
  });

  it('keeps what a guest was typing when they sign in', () => {
    authStore.setState({ user: guest('g') });
    render(<AuthCacheSync />);

    act(() => authStore.setState({ user: profile('b') }));

    expect(newConversation).toHaveBeenCalledWith({ keepDraft: true });
  });

  it('wipes what one account was typing when another signs in', () => {
    render(<AuthCacheSync />);

    act(() => authStore.setState({ user: profile('b') }));

    expect(newConversation).toHaveBeenCalledWith({ keepDraft: false });
  });

  it('wipes what a guest was typing when another guest takes over', () => {
    authStore.setState({ user: guest('g1') });
    render(<AuthCacheSync />);

    act(() => authStore.setState({ user: guest('g2') }));

    expect(newConversation).toHaveBeenCalledWith({ keepDraft: false });
  });

  it('wipes what a guest was typing when the session ends', () => {
    authStore.setState({ user: guest('g') });
    render(<AuthCacheSync />);

    act(() => authStore.setState({ isAuthenticated: false, user: null }));

    expect(newConversation.mock.calls).toEqual([[]]);
  });

  it('keeps the sockets when a refresh keeps the same user', () => {
    render(<AuthCacheSync />);

    act(() => authStore.setState({ user: profile('a') }));

    expect(agentClient.disconnect).not.toHaveBeenCalled();
    expect(aiClient.disconnect).not.toHaveBeenCalled();
  });

  it('keeps the sockets on the first sign-in', () => {
    authStore.setState({ isAuthenticated: false, user: null });
    render(<AuthCacheSync />);

    act(() =>
      authStore.setState({ isAuthenticated: true, user: profile('a') })
    );

    expect(agentClient.disconnect).not.toHaveBeenCalled();
    expect(aiClient.disconnect).not.toHaveBeenCalled();
  });
});
