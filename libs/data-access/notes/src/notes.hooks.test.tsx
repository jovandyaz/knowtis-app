// @vitest-environment jsdom
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { notesApi, type NoteWithAccess } from '@knowtis/api-client';
import {
  DEFAULT_NOTES_PAGE_SIZE,
  type NoteBucketCounts,
} from '@knowtis/shared-types';

import {
  notesQueryKeys,
  useCreateNote,
  useNoteCounts,
  useNotes,
  useRestoreNote,
  useUpdateNote,
} from './notes.hooks';

// Mock the API
vi.mock('@knowtis/api-client', () => ({
  notesApi: {
    getAll: vi.fn(),
    getCounts: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    restore: vi.fn(),
  },
}));

const EMPTY_PAGE = {
  items: [],
  total: 0,
  page: 1,
  limit: DEFAULT_NOTES_PAGE_SIZE,
};

describe('Notes Hooks', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  describe('useNotes', () => {
    it('should fetch notes successfully', async () => {
      const mockNotes: NoteWithAccess[] = [
        {
          id: '1',
          title: 'Note 1',
          content: 'Content 1',
          accessLevel: 'owner',
          ownerId: 'user-1',
          generalAccess: 'restricted',
          generalAccessPermission: 'viewer',
          shareToken: null,
          editorsCanShare: false,
          bucket: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          title: 'Note 2',
          content: 'Content 2',
          accessLevel: 'editor',
          ownerId: 'user-2',
          generalAccess: 'anyone_with_link',
          generalAccessPermission: 'editor',
          shareToken: 'token-abc',
          editorsCanShare: true,
          bucket: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      vi.mocked(notesApi.getAll).mockResolvedValue({
        items: mockNotes,
        total: mockNotes.length,
        page: 1,
        limit: DEFAULT_NOTES_PAGE_SIZE,
      });

      const { result } = renderHook(() => useNotes(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.pages[0].items).toEqual(mockNotes);
      expect(notesApi.getAll).toHaveBeenCalledWith({
        page: 1,
        limit: DEFAULT_NOTES_PAGE_SIZE,
      });
    });

    it('should pass search parameter', async () => {
      vi.mocked(notesApi.getAll).mockResolvedValue(EMPTY_PAGE);

      const { result } = renderHook(() => useNotes({ search: 'search term' }), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(notesApi.getAll).toHaveBeenCalledWith({
        search: 'search term',
        page: 1,
        limit: DEFAULT_NOTES_PAGE_SIZE,
      });
    });

    it('forwards filters to notesApi.getAll', async () => {
      vi.mocked(notesApi.getAll).mockResolvedValue(EMPTY_PAGE);

      const { result } = renderHook(
        () => useNotes({ bucket: 'projects', view: 'mine' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(notesApi.getAll).toHaveBeenCalledWith({
        page: 1,
        limit: DEFAULT_NOTES_PAGE_SIZE,
        bucket: 'projects',
        view: 'mine',
      });
    });
  });

  describe('useNoteCounts', () => {
    it('hits /notes/counts and caches under the counts key', async () => {
      const counts: NoteBucketCounts = {
        inbox: 1,
        projects: 0,
        areas: 0,
        resources: 0,
        archive: 0,
      };
      vi.mocked(notesApi.getCounts).mockResolvedValue(counts);

      const { result } = renderHook(() => useNoteCounts(), { wrapper });

      await waitFor(() => expect(result.current.data?.inbox).toBe(1));

      expect(notesApi.getCounts).toHaveBeenCalled();
      expect(queryClient.getQueryData(notesQueryKeys.counts())).toEqual(counts);
    });
  });

  describe('useCreateNote', () => {
    it('should create note and invalidate queries', async () => {
      const newNote = {
        id: 'new-123',
        title: 'New Note',
        content: '',
        ownerId: 'user-1',
        generalAccess: 'restricted' as const,
        generalAccessPermission: 'viewer' as const,
        shareToken: null,
        editorsCanShare: false,
        bucket: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(notesApi.create).mockResolvedValue(newNote);

      const { result } = renderHook(() => useCreateNote(), { wrapper });

      result.current.mutate({ title: 'New Note' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(notesApi.create).toHaveBeenCalledWith({ title: 'New Note' });
    });
  });

  describe('useUpdateNote', () => {
    it('invalidates counts', async () => {
      vi.mocked(notesApi.update).mockResolvedValue({
        id: 'n1',
        bucket: 'areas',
      } as never);
      const spy = vi.spyOn(queryClient, 'invalidateQueries');
      const { result } = renderHook(() => useUpdateNote(), { wrapper });

      result.current.mutate({ id: 'n1', input: { bucket: 'areas' } });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(spy).toHaveBeenCalledWith({ queryKey: ['notes', 'counts'] });
    });
  });

  describe('useRestoreNote', () => {
    it('useRestoreNote calls the restore endpoint and invalidates list and detail caches', async () => {
      vi.mocked(notesApi.restore).mockResolvedValue({ id: 'n1' } as never);
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const { result } = renderHook(() => useRestoreNote(), { wrapper });

      result.current.mutate('n1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(notesApi.restore).toHaveBeenCalledWith('n1');
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: notesQueryKeys.lists(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: notesQueryKeys.detail('n1'),
      });
    });
  });

  describe('notesQueryKeys', () => {
    it('should generate correct query keys', () => {
      expect(notesQueryKeys.all).toEqual(['notes']);
      expect(notesQueryKeys.lists()).toEqual(['notes', 'list']);
      expect(notesQueryKeys.list({ search: 'search' })).toEqual([
        'notes',
        'list',
        { search: 'search', bucket: undefined, view: undefined },
      ]);
      expect(notesQueryKeys.counts()).toEqual(['notes', 'counts']);
      expect(notesQueryKeys.detail('123')).toEqual(['notes', 'detail', '123']);
    });
  });
});
