import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiClient from '@knowtis/api-client';
import { ApiClientError, conversationsApi } from '@knowtis/api-client';
import type { ConversationPage } from '@knowtis/shared-types';

import {
  conversationsQueryKeys,
  invalidateConversations,
  isConversationGone,
  useConversations,
  useDeleteConversation,
  useRenameConversation,
} from './conversations.hooks';

vi.mock('@knowtis/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  conversationsApi: {
    list: vi.fn(),
    transcript: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
  },
}));

const LIMIT = 25;

const PAGE: ConversationPage = {
  items: [
    {
      id: 'c1',
      title: 'Trip',
      noteId: null,
      noteTitle: null,
      updatedAt: '2026-09-22T10:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  limit: LIMIT,
};

describe('conversation hooks', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const isStale = () =>
    queryClient.getQueryState(conversationsQueryKeys.list(LIMIT))
      ?.isInvalidated;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  it('nests the list key under the conversations root', () => {
    expect(conversationsQueryKeys.list(LIMIT)).toEqual([
      'conversations',
      'list',
      LIMIT,
    ]);
  });

  it('fetches the first page with the requested size', async () => {
    vi.mocked(conversationsApi.list).mockResolvedValue(PAGE);

    const { result } = renderHook(() => useConversations(LIMIT), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(PAGE));
    expect(conversationsApi.list).toHaveBeenCalledWith({
      page: 1,
      limit: LIMIT,
    });
  });

  it('marks the list stale after a rename', async () => {
    queryClient.setQueryData(conversationsQueryKeys.list(LIMIT), PAGE);
    vi.mocked(conversationsApi.rename).mockResolvedValue(undefined);

    const { result } = renderHook(() => useRenameConversation(), { wrapper });
    await act(() => result.current.mutateAsync({ id: 'c1', title: 'Oaxaca' }));

    expect(conversationsApi.rename).toHaveBeenCalledWith('c1', 'Oaxaca');
    expect(isStale()).toBe(true);
  });

  it('marks the list stale even when a delete finds nothing', async () => {
    queryClient.setQueryData(conversationsQueryKeys.list(LIMIT), PAGE);
    vi.mocked(conversationsApi.remove).mockRejectedValue(
      new ApiClientError('Conversation not found', 404)
    );

    const { result } = renderHook(() => useDeleteConversation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('c1').catch(() => undefined);
    });

    expect(conversationsApi.remove).toHaveBeenCalledWith('c1');
    expect(isStale()).toBe(true);
  });

  it('hands a delete outcome to the caller and still marks the list stale', async () => {
    queryClient.setQueryData(conversationsQueryKeys.list(LIMIT), PAGE);
    vi.mocked(conversationsApi.remove).mockResolvedValue(undefined);
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useDeleteConversation({ onSuccess }), {
      wrapper,
    });
    await act(() => result.current.mutateAsync('c1'));

    expect(onSuccess.mock.calls.map(([data, id]) => [data, id])).toEqual([
      [undefined, 'c1'],
    ]);
    expect(isStale()).toBe(true);
  });

  it('marks every conversation list stale on demand', () => {
    queryClient.setQueryData(conversationsQueryKeys.list(LIMIT), PAGE);

    invalidateConversations(queryClient);

    expect(isStale()).toBe(true);
  });

  it.each([
    ['a 404 from the API', new ApiClientError('gone', 404), true],
    ['another API failure', new ApiClientError('boom', 500), false],
    ['a plain error', new Error('404'), false],
    ['nothing', undefined, false],
  ])('reads %s as gone: %s', (_label, error, gone) => {
    expect(isConversationGone(error)).toBe(gone);
  });
});
