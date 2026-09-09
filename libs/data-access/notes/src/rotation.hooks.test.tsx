// @vitest-environment jsdom
import type { ReactNode } from 'react';

import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from '@tanstack/react-query';

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notesApi, type NoteDetail } from '@knowtis/api-client';

import { notesQueryKeys } from './query-keys';
import { useRotateShareLink } from './rotation.hooks';

const before: NoteDetail = {
  id: 'note',
  ownerId: 'owner',
  title: 'Note',
  content: '<p>Content</p>',
  shareToken: 'old',
  generalAccess: 'restricted',
  generalAccessPermission: 'viewer',
  editorsCanShare: true,
  bucket: null,
  supertag: null,
  supertagFields: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  tags: ['tag'],
  owner: { id: 'owner', name: 'Owner', avatarUrl: null },
  accessLevel: 'owner',
};
const after = { ...before, shareToken: 'new' };
describe('useRotateShareLink', () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: 3, retryDelay: 0 },
      },
    });
    client.setQueryData(notesQueryKeys.detail('note'), before);
    client.setQueryData(notesQueryKeys.sharedNote('old'), before);
    client.setQueryData(notesQueryKeys.sharedNote('other'), {
      ...before,
      id: 'other',
    });
    client.setQueryData(notesQueryKeys.list(), { pages: [] });
  });
  afterEach(() => {
    cleanup();
    client.clear();
    vi.unstubAllGlobals();
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  it('posts no body, replaces detail token while retaining owner metadata, removes old shared cache and invalidates lists', async () => {
    const requests: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toContain('/notes/note/share-link/rotate');
        requests.push(init);
        const {
          owner: _owner,
          tags: _tags,
          accessLevel: _access,
          ...view
        } = after;
        return new Response(JSON.stringify(view), { status: 200 });
      })
    );
    const { result } = renderHook(() => useRotateShareLink('note'), {
      wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.body).toBeUndefined();
    expect(client.getQueryData(notesQueryKeys.detail('note'))).toMatchObject({
      shareToken: 'new',
      owner: before.owner,
      tags: ['tag'],
      accessLevel: 'owner',
    });
    expect(
      client.getQueryData(notesQueryKeys.sharedNote('old'))
    ).toBeUndefined();
    expect(
      client.getQueryData(notesQueryKeys.sharedNote('other'))
    ).toBeDefined();
    expect(client.getQueryState(notesQueryKeys.list())?.isInvalidated).toBe(
      true
    );
  });
  it('refetches authority after a lost response without retrying even with global retries enabled', async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        requests.push(init.method ?? 'GET');
        if (init.method === 'POST') {
          throw new TypeError('Response lost after commit');
        }
        expect(url).toContain('/notes/note');
        return new Response(JSON.stringify(after), { status: 200 });
      })
    );
    const { result } = renderHook(() => useRotateShareLink('note'), {
      wrapper,
    });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow(
        'Response lost'
      );
    });
    expect(requests).toEqual(['POST', 'GET']);
    expect(client.getQueryData(notesQueryKeys.detail('note'))).toMatchObject({
      shareToken: 'new',
    });
    expect(
      client.getQueryData(notesQueryKeys.sharedNote('old'))
    ).toBeUndefined();
  });
  it('prevents a read started before commit from restoring the old token after success', async () => {
    const response = Promise.withResolvers<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => response.promise)
    );
    const { result } = renderHook(() => useRotateShareLink('note'), {
      wrapper,
    });
    let mutation!: Promise<unknown>;
    await act(async () => {
      mutation = result.current.mutateAsync();
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    });
    const stale = Promise.withResolvers<NoteDetail>();
    const read = client
      .fetchQuery({
        queryKey: notesQueryKeys.detail('note'),
        queryFn: () => stale.promise,
      })
      .catch(() => undefined);
    await act(async () => {
      response.resolve(new Response(JSON.stringify(after), { status: 200 }));
      await mutation;
    });
    await act(async () => {
      stale.resolve(before);
      await read;
    });
    expect(client.getQueryData(notesQueryKeys.detail('note'))).toMatchObject({
      shareToken: 'new',
    });
  });
  it('refreshes dedicated sharing authority from GET before releasing the mutation', async () => {
    const methods: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        methods.push(init.method ?? 'GET');
        return new Response(JSON.stringify(after), { status: 200 });
      })
    );
    client.setQueryData(notesQueryKeys.sharingAuthority('note'), before);
    const observer = new QueryObserver(client, {
      queryKey: notesQueryKeys.sharingAuthority('note'),
      queryFn: () => notesApi.getById('note'),
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    try {
      const { result } = renderHook(() => useRotateShareLink('note'), {
        wrapper,
      });
      await act(async () => {
        await result.current.mutateAsync();
      });
      expect(methods).toEqual(['POST', 'GET']);
      expect(
        client.getQueryData(notesQueryKeys.sharingAuthority('note'))
      ).toMatchObject({ shareToken: 'new' });
    } finally {
      unsubscribe();
    }
  });
  it('preserves the mutation error when reconciliation also fails and never restores the old shared cache', async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        requests.push(init.method ?? 'GET');
        throw new TypeError(
          init.method === 'POST' ? 'Uncertain rotation' : 'Still offline'
        );
      })
    );
    const { result } = renderHook(() => useRotateShareLink('note'), {
      wrapper,
    });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow(
        'Uncertain rotation'
      );
    });
    expect(requests).toEqual(['POST', 'GET']);
    expect(client.getQueryState(notesQueryKeys.detail('note'))?.status).toBe(
      'error'
    );
    expect(
      client.getQueryData(notesQueryKeys.sharedNote('old'))
    ).toBeUndefined();
  });
});
