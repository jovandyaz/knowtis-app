import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { httpClient } from '@knowtis/api-client';

import { useAdminUsers, useUpdateUserRole } from './admin.hooks';

vi.mock('@knowtis/api-client', () => ({
  httpClient: { get: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const PAGE = {
  items: [
    {
      id: '3b241101-e2bb-4255-8caf-4136c566a962',
      email: 'ada@knowtis.app',
      name: 'Ada',
      avatarUrl: null,
      role: 'admin',
      provider: 'local',
      isAnonymous: false,
      createdAt: '2026-07-01T00:00:00.000Z',
      emailVerifiedAt: null,
    },
  ],
  total: 1,
  page: 1,
  limit: 25,
};

describe('useAdminUsers', () => {
  it('fetches and validates a page of users', async () => {
    vi.mocked(httpClient.get).mockResolvedValue(PAGE);

    const { result } = renderHook(() => useAdminUsers({ page: 1, limit: 25 }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(httpClient.get).toHaveBeenCalledWith('/admin/users?page=1&limit=25');
    expect(result.current.data?.items[0].email).toBe('ada@knowtis.app');
    expect(result.current.data?.items[0].createdAt).toBeInstanceOf(Date);
  });

  it('encodes the search param', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      ...PAGE,
      items: [],
      total: 0,
    });

    renderHook(() => useAdminUsers({ page: 1, limit: 25, search: 'a b' }), {
      wrapper,
    });

    await waitFor(() =>
      expect(httpClient.get).toHaveBeenCalledWith(
        '/admin/users?page=1&limit=25&search=a%20b'
      )
    );
  });
});

describe('useUpdateUserRole', () => {
  it('patches the role endpoint', async () => {
    vi.mocked(httpClient.patch).mockResolvedValue(PAGE.items[0]);

    const { result } = renderHook(() => useUpdateUserRole(), { wrapper });
    result.current.mutate({ userId: PAGE.items[0].id, role: 'user' });

    await waitFor(() =>
      expect(httpClient.patch).toHaveBeenCalledWith(
        `/admin/users/${PAGE.items[0].id}/role`,
        { role: 'user' }
      )
    );
  });
});
