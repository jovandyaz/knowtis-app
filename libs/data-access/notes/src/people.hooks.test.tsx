import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import { notesApi, type NoteDetail } from '@knowtis/api-client';

import { useNote } from './notes.hooks';
import {
  usePeople,
  useRevokePerson,
  useSharingAuthority,
  useUpsertPerson,
} from './people.hooks';
import { notesQueryKeys } from './query-keys';

vi.mock('@knowtis/api-client', () => ({
  notesApi: {
    getPeople: vi.fn(),
    getById: vi.fn(),
    upsertPerson: vi.fn(),
    revokePerson: vi.fn(),
  },
}));

const owner = {
  user: {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Owner',
    email: 'owner@example.com',
    avatarUrl: null,
  },
  permission: 'owner' as const,
};
const person = {
  user: {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Person',
    email: 'person@example.com',
    avatarUrl: null,
  },
  permission: 'viewer' as const,
};

const note: NoteDetail = {
  id: 'one',
  title: 'Note',
  content: '',
  ownerId: owner.user.id,
  owner: owner.user,
  accessLevel: 'owner',
  generalAccess: 'restricted',
  generalAccessPermission: 'viewer',
  shareToken: null,
  editorsCanShare: true,
  tags: [],
  bucket: null,
  supertag: null,
  supertagFields: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('People hooks', () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  beforeEach(() => {
    vi.resetAllMocks();
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.mocked(notesApi.getPeople).mockResolvedValue([owner, person]);
  });
  afterEach(() => {
    cleanup();
    client.clear();
  });

  it('keeps a People mutation pending until the separate authority GET settles', async () => {
    const refresh = deferred<NoteDetail>();
    vi.mocked(notesApi.getById)
      .mockResolvedValueOnce(note)
      .mockReturnValue(refresh.promise);
    vi.mocked(notesApi.upsertPerson).mockResolvedValue(person);
    client.setQueryData(notesQueryKeys.sharingAuthority('two'), note);
    const { result } = renderHook(
      () => ({
        authority: useSharingAuthority('one', true),
        save: useUpsertPerson(),
      }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.authority.isSuccess).toBe(true));
    act(() =>
      result.current.save.mutate({
        noteId: 'one',
        input: { email: person.user.email, permission: 'viewer' },
      })
    );
    await waitFor(() => expect(notesApi.getById).toHaveBeenCalledTimes(2));
    expect(result.current.save.isPending).toBe(true);
    expect(
      client.getQueryState(notesQueryKeys.sharingAuthority('two'))
        ?.isInvalidated
    ).toBe(false);
    await act(async () => refresh.resolve({ ...note, editorsCanShare: false }));
    await waitFor(() => expect(result.current.save.isSuccess).toBe(true));
    expect(result.current.authority.data?.editorsCanShare).toBe(false);
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['string policy', { ...note, editorsCanShare: 'false' }],
    ['invalid owner', { ...note, ownerId: 'missing-owner' }],
    ['invalid access level', { ...note, accessLevel: 'administrator' }],
    ['invalid general access', { ...note, generalAccess: 'public' }],
    ['invalid link permission', { ...note, generalAccessPermission: 'owner' }],
    ['invalid token', { ...note, shareToken: 123 }],
  ])(
    'rejects %s authority and recovers on an explicit retry',
    async (_label, response) => {
      vi.mocked(notesApi.getById)
        .mockResolvedValueOnce(response as NoteDetail)
        .mockResolvedValue({ ...note, editorsCanShare: false });
      const { result } = renderHook(() => useSharingAuthority('one', true), {
        wrapper,
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBeInstanceOf(ZodError);
      expect(result.current.data).toBeUndefined();
      expect(notesApi.getById).toHaveBeenCalledTimes(1);
      await act(async () => {
        await result.current.refetch();
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual({ ...note, editorsCanShare: false });
    }
  );

  it('preserves the full note response after validating sharing authority', async () => {
    vi.mocked(notesApi.getById).mockResolvedValue(note);
    const { result } = renderHook(() => useSharingAuthority('one', true), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(note);
  });

  it('reads authoritative people with isolated note keys', async () => {
    const { result } = renderHook(() => usePeople('one', true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([owner, person]);
    expect(client.getQueryData(notesQueryKeys.people('two'))).toBeUndefined();
  });

  it('does not query a closed dialog', () => {
    renderHook(() => usePeople('one', false), { wrapper });
    expect(notesApi.getPeople).not.toHaveBeenCalled();
  });

  it('rejects malformed People rather than displaying an empty success', async () => {
    vi.mocked(notesApi.getPeople).mockResolvedValue([
      { ...owner, user: { ...owner.user, id: 'temporary-id' } },
    ]);
    const { result } = renderHook(() => usePeople('one', true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('normalizes email and waits for reconciliation without optimistic recipients', async () => {
    const save = deferred<typeof person>();
    const refresh = deferred<(typeof owner | typeof person)[]>();
    vi.mocked(notesApi.upsertPerson).mockReturnValue(save.promise);
    vi.mocked(notesApi.getPeople)
      .mockResolvedValueOnce([owner])
      .mockReturnValue(refresh.promise);
    const { result } = renderHook(
      () => ({ people: usePeople('one', true), save: useUpsertPerson() }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.people.isSuccess).toBe(true));
    act(() =>
      result.current.save.mutate({
        noteId: 'one',
        input: { email: ' PERSON@Example.com ', permission: 'viewer' },
      })
    );
    await waitFor(() =>
      expect(notesApi.upsertPerson).toHaveBeenCalledWith('one', {
        email: 'person@example.com',
        permission: 'viewer',
      })
    );
    expect(result.current.people.data).toEqual([owner]);
    await act(async () => save.resolve(person));
    await waitFor(() => expect(notesApi.getPeople).toHaveBeenCalledTimes(2));
    expect(result.current.save.isPending).toBe(true);
    await act(async () => refresh.resolve([owner, person]));
    await waitFor(() => expect(result.current.save.isSuccess).toBe(true));
    expect(result.current.save.data).toEqual(person);
    expect(result.current.people.data).toEqual([owner, person]);
  });

  it('preserves rows on a failed write and invalidates all access-dependent caches', async () => {
    vi.mocked(notesApi.upsertPerson).mockRejectedValue(new Error('refused'));
    const keys = [
      notesQueryKeys.detail('one'),
      notesQueryKeys.lists(),
      notesQueryKeys.recents(),
      notesQueryKeys.counts(),
    ];
    for (const key of keys) {
      client.setQueryData(key, { cached: true });
    }
    client.setQueryData(notesQueryKeys.people('two'), [owner]);
    const { result } = renderHook(
      () => ({ people: usePeople('one', true), save: useUpsertPerson() }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.people.isSuccess).toBe(true));
    await act(async () => {
      await expect(
        result.current.save.mutateAsync({
          noteId: 'one',
          input: { email: 'person@example.com', permission: 'editor' },
        })
      ).rejects.toThrow('refused');
    });
    expect(result.current.people.data).toEqual([owner, person]);
    for (const key of keys) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
    expect(
      client.getQueryState(notesQueryKeys.people('two'))?.isInvalidated
    ).toBe(false);
  });

  it('marks the note detail stale without refetching it', async () => {
    vi.mocked(notesApi.upsertPerson).mockResolvedValue(person);
    vi.mocked(notesApi.getById).mockResolvedValue(note);
    const { result } = renderHook(
      () => ({ detail: useNote('one'), save: useUpsertPerson() }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));
    expect(notesApi.getById).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.save.mutateAsync({
        noteId: 'one',
        input: { email: 'person@example.com', permission: 'viewer' },
      });
    });

    await waitFor(() =>
      expect(
        client.getQueryState(notesQueryKeys.detail('one'))?.isInvalidated
      ).toBe(true)
    );
    expect(notesApi.getById).toHaveBeenCalledTimes(1);
  });

  it('keeps a successful write successful when the permission refresh fails', async () => {
    vi.mocked(notesApi.upsertPerson).mockResolvedValue(person);
    vi.mocked(notesApi.getPeople)
      .mockResolvedValueOnce([owner])
      .mockRejectedValue(new Error('offline'));
    const { result } = renderHook(
      () => ({ people: usePeople('one', true), save: useUpsertPerson() }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.people.isSuccess).toBe(true));
    await act(async () => {
      await result.current.save.mutateAsync({
        noteId: 'one',
        input: { email: person.user.email, permission: 'viewer' },
      });
    });
    await waitFor(() => expect(result.current.people.isError).toBe(true));
    expect(result.current.save.isSuccess).toBe(true);
  });

  it('rejects malformed upsert responses', async () => {
    vi.mocked(notesApi.upsertPerson).mockResolvedValue({
      ...person,
      user: { ...person.user, id: '' },
    });
    const { result } = renderHook(() => useUpsertPerson(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          noteId: 'one',
          input: { email: person.user.email, permission: 'viewer' },
        })
      ).rejects.toThrow();
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('accepts void removal and reconciles the authoritative list', async () => {
    vi.mocked(notesApi.revokePerson).mockResolvedValue(undefined);
    vi.mocked(notesApi.getPeople)
      .mockResolvedValueOnce([owner, person])
      .mockResolvedValue([owner]);
    const { result } = renderHook(
      () => ({ people: usePeople('one', true), remove: useRevokePerson() }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.people.isSuccess).toBe(true));
    await act(async () => {
      expect(
        await result.current.remove.mutateAsync({
          noteId: 'one',
          userId: person.user.id,
        })
      ).toBeUndefined();
    });
    await waitFor(() => expect(result.current.people.data).toEqual([owner]));
  });
});
