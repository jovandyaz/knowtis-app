import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ApiClient from '@knowtis/api-client';
import { ApiClientError, memoriesApi } from '@knowtis/api-client';
import type { UserMemoryItem } from '@knowtis/shared-types';

import {
  memoriesQueryKeys,
  useEditMemory,
  useForgetAllMemories,
  useForgetMemory,
  useMemories,
} from './memories.hooks';

vi.mock('@knowtis/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  memoriesApi: {
    list: vi.fn(),
    edit: vi.fn(),
    remove: vi.fn(),
    removeAll: vi.fn(),
  },
}));

function memory(id: string, content: string): UserMemoryItem {
  return {
    id,
    content,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    source: null,
    withheld: false,
  };
}

const EDITED_AT = '2026-10-18T12:00:00.000Z';
const VEGAN = memory('m1', 'I am vegan');
const LIMA = memory('m2', 'I live in Lima');
const NURSE = memory('m3', 'I work as a nurse');
const MEMORIES = [VEGAN, LIMA, NURSE];

function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('memory hooks', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const cached = () =>
    queryClient.getQueryData<UserMemoryItem[]>(memoriesQueryKeys.list());
  const isStale = () =>
    queryClient.getQueryState(memoriesQueryKeys.list())?.isInvalidated;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  it('nests the list key under the memories root', () => {
    expect(memoriesQueryKeys.list()).toEqual(['memories', 'list']);
  });

  it('reads the memories in the order the API gives them', async () => {
    vi.mocked(memoriesApi.list).mockResolvedValue(MEMORIES);

    const { result } = renderHook(() => useMemories(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(MEMORIES));
  });

  describe('useForgetMemory', () => {
    it('reads the list again only once the last concurrent forget settles, so none comes back', async () => {
      const lima = deferred();
      let server = MEMORIES;
      vi.mocked(memoriesApi.list).mockImplementation(async () => server);
      vi.mocked(memoriesApi.remove).mockImplementation(async (id) => {
        if (id === LIMA.id) {
          await lima.promise;
        }
        server = server.filter((memory) => memory.id !== id);
      });
      const ids = () => (cached() ?? []).map(({ id }) => id);

      const { result } = renderHook(
        () => ({ list: useMemories(), forget: useForgetMemory() }),
        { wrapper }
      );
      await waitFor(() => expect(result.current.list.data).toEqual(MEMORIES));
      act(() => result.current.forget.mutate(LIMA.id));
      await waitFor(() => expect(ids()).not.toContain(LIMA.id));
      const seen: string[][] = [];
      const unsubscribe = queryClient
        .getQueryCache()
        .subscribe(() => seen.push(ids()));

      await act(() => result.current.forget.mutateAsync(VEGAN.id));
      await act(async () => {
        lima.resolve();
        await lima.promise;
      });
      await waitFor(() => expect(result.current.list.data).toEqual([NURSE]));
      unsubscribe();

      expect(seen.filter((snapshot) => snapshot.includes(LIMA.id))).toEqual([]);
      expect(memoriesApi.list).toHaveBeenCalledTimes(2);
    });

    it('removes the memory before the API answers', async () => {
      queryClient.setQueryData(memoriesQueryKeys.list(), MEMORIES);
      const pending = deferred();
      vi.mocked(memoriesApi.remove).mockReturnValue(pending.promise);

      const { result } = renderHook(() => useForgetMemory(), { wrapper });
      act(() => result.current.mutate(LIMA.id));

      await waitFor(() => expect(cached()).toEqual([VEGAN, NURSE]));
      expect(memoriesApi.remove).toHaveBeenCalledWith(LIMA.id);
      await act(async () => pending.resolve());
    });

    it('puts the memory back where it was when the API fails', async () => {
      queryClient.setQueryData(memoriesQueryKeys.list(), MEMORIES);
      vi.mocked(memoriesApi.remove).mockRejectedValue(
        new ApiClientError('boom', 500)
      );
      const onError = vi.fn();

      const { result } = renderHook(() => useForgetMemory({ onError }), {
        wrapper,
      });
      await act(async () => {
        await result.current.mutateAsync(LIMA.id).catch(() => undefined);
      });

      expect(cached()).toEqual(MEMORIES);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(isStale()).toBe(true);
    });

    it('puts back only the failed memory when another forget succeeded meanwhile', async () => {
      queryClient.setQueryData(memoriesQueryKeys.list(), MEMORIES);
      const failing = deferred();
      vi.mocked(memoriesApi.remove)
        .mockReturnValueOnce(failing.promise)
        .mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useForgetMemory(), { wrapper });
      act(() => result.current.mutate(VEGAN.id));
      await waitFor(() => expect(cached()).toEqual([LIMA, NURSE]));
      await act(() => result.current.mutateAsync(NURSE.id));
      await act(async () => {
        failing.reject(new ApiClientError('boom', 500));
        await failing.promise.catch(() => undefined);
      });

      await waitFor(() => expect(cached()).toEqual([VEGAN, LIMA]));
    });

    it('counts a memory the API no longer has as forgotten', async () => {
      queryClient.setQueryData(memoriesQueryKeys.list(), MEMORIES);
      vi.mocked(memoriesApi.remove).mockRejectedValue(
        new ApiClientError('Memory not found', 404)
      );
      const onSuccess = vi.fn();
      const onError = vi.fn();

      const { result } = renderHook(
        () => useForgetMemory({ onSuccess, onError }),
        { wrapper }
      );
      await act(() => result.current.mutateAsync(LIMA.id));

      expect(cached()).toEqual([VEGAN, NURSE]);
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
      expect(isStale()).toBe(true);
    });
  });

  describe('useForgetAllMemories', () => {
    it('empties the list and hands the deleted count to the caller', async () => {
      queryClient.setQueryData(memoriesQueryKeys.list(), MEMORIES);
      vi.mocked(memoriesApi.removeAll).mockResolvedValue({ deleted: 3 });
      const onSuccess = vi.fn();

      const { result } = renderHook(() => useForgetAllMemories({ onSuccess }), {
        wrapper,
      });
      await act(() => result.current.mutateAsync());

      expect(cached()).toEqual([]);
      expect(onSuccess).toHaveBeenCalledWith(3);
      expect(isStale()).toBe(true);
    });

    it('keeps the list and reports the failure', async () => {
      queryClient.setQueryData(memoriesQueryKeys.list(), MEMORIES);
      vi.mocked(memoriesApi.removeAll).mockRejectedValue(
        new ApiClientError('boom', 500)
      );
      const onError = vi.fn();

      const { result } = renderHook(() => useForgetAllMemories({ onError }), {
        wrapper,
      });
      await act(async () => {
        await result.current.mutateAsync().catch(() => undefined);
      });

      expect(cached()).toEqual(MEMORIES);
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  describe('useEditMemory', () => {
    it('shows the accepted text as just updated and reads the list again', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(EDITED_AT));
      queryClient.setQueryData(memoriesQueryKeys.list(), MEMORIES);
      vi.mocked(memoriesApi.edit).mockResolvedValue(undefined);

      const { result } = renderHook(() => useEditMemory(), { wrapper });
      await act(() =>
        result.current.mutateAsync({ id: LIMA.id, content: 'I live in Quito' })
      );
      vi.useRealTimers();

      expect(memoriesApi.edit).toHaveBeenCalledWith(LIMA.id, 'I live in Quito');
      expect(cached()).toEqual([
        VEGAN,
        { ...LIMA, content: 'I live in Quito', updatedAt: EDITED_AT },
        NURSE,
      ]);
      expect(isStale()).toBe(true);
    });

    it('hands the outcome to the caller even after it unmounted', async () => {
      queryClient.setQueryData(memoriesQueryKeys.list(), MEMORIES);
      const pending = deferred();
      vi.mocked(memoriesApi.edit).mockReturnValue(pending.promise);
      const onError = vi.fn();

      const { result, unmount } = renderHook(() => useEditMemory({ onError }), {
        wrapper,
      });
      act(() =>
        result.current.mutate({ id: LIMA.id, content: 'I live in Quito' })
      );
      unmount();
      await act(async () => {
        pending.reject(new ApiClientError('boom', 500));
        await pending.promise.catch(() => undefined);
      });

      await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    });

    it('keeps the cached memories when the text is refused', async () => {
      queryClient.setQueryData(memoriesQueryKeys.list(), MEMORIES);
      vi.mocked(memoriesApi.edit).mockRejectedValue(
        new ApiClientError('refused', 422, 'AGENT_MEMORY_REJECTED')
      );

      const { result } = renderHook(() => useEditMemory(), { wrapper });
      await act(async () => {
        await result.current
          .mutateAsync({ id: LIMA.id, content: 'see https://x.test' })
          .catch(() => undefined);
      });

      expect(cached()).toEqual(MEMORIES);
    });

    it('reads the list again when the memory is gone', async () => {
      queryClient.setQueryData(memoriesQueryKeys.list(), MEMORIES);
      vi.mocked(memoriesApi.edit).mockRejectedValue(
        new ApiClientError('Memory not found', 404)
      );

      const { result } = renderHook(() => useEditMemory(), { wrapper });
      await act(async () => {
        await result.current
          .mutateAsync({ id: LIMA.id, content: 'I live in Quito' })
          .catch(() => undefined);
      });

      expect(isStale()).toBe(true);
    });
  });
});
