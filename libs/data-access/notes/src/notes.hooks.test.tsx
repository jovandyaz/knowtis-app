// @vitest-environment jsdom
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { notesApi, type NoteWithAccess } from '@knowtis/api-client';

import {
  notesQueryKeys,
  useCreateNote,
  useNotes,
  useRestoreNote,
} from './notes.hooks';

// Mock the API
vi.mock('@knowtis/api-client', () => ({
  notesApi: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    restore: vi.fn(),
  },
}));

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
      vi.mocked(notesApi.getAll).mockResolvedValue(mockNotes);

      const { result } = renderHook(() => useNotes(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockNotes);
      expect(notesApi.getAll).toHaveBeenCalledWith(undefined);
    });

    it('should pass search parameter', async () => {
      vi.mocked(notesApi.getAll).mockResolvedValue([]);

      const { result } = renderHook(() => useNotes('search term'), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(notesApi.getAll).toHaveBeenCalledWith({ search: 'search term' });
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
      expect(notesQueryKeys.list('search')).toEqual([
        'notes',
        'list',
        { search: 'search' },
      ]);
      expect(notesQueryKeys.detail('123')).toEqual(['notes', 'detail', '123']);
    });
  });
});
