import {
  DEFAULT_NOTES_PAGE_SIZE,
  type CreateNoteInput,
  type Note,
  type NoteAccessLevel,
  type NoteBucketCounts,
  type NotePermission,
  type NotesListFilters,
  type NotesPage,
  type NoteWithOwner,
  type ShareNoteInput,
  type UpdateNoteInput,
} from '@knowtis/shared-types';

import { httpClient } from './http-client';

/**
 * Extended note type with access level
 */
export interface NoteWithAccess extends Note {
  accessLevel: NoteAccessLevel;
}

/**
 * Collaborator with user info
 */
export interface NoteCollaborator {
  permission: NotePermission;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  };
}

export const notesApi = {
  /** Returns one page of accessible notes, newest first, alongside the unpaged total. */
  async getAll(
    params?: NotesListFilters & { page?: number; limit?: number }
  ): Promise<NotesPage<NoteWithAccess>> {
    const query = new URLSearchParams();
    query.set('page', String(params?.page ?? 1));
    query.set('limit', String(params?.limit ?? DEFAULT_NOTES_PAGE_SIZE));
    if (params?.search) {
      query.set('search', params.search);
    }
    if (params?.bucket) {
      query.set('bucket', params.bucket);
    }
    if (params?.view && params.view !== 'all') {
      query.set('view', params.view);
    }
    return httpClient.get<NotesPage<NoteWithAccess>>(
      `/notes?${query.toString()}`
    );
  },

  async getCounts(): Promise<NoteBucketCounts> {
    return httpClient.get<NoteBucketCounts>('/notes/counts');
  },

  async getById(
    id: string
  ): Promise<NoteWithOwner & { accessLevel: NoteAccessLevel }> {
    return httpClient.get<NoteWithOwner & { accessLevel: NoteAccessLevel }>(
      `/notes/${id}`
    );
  },

  async create(input: CreateNoteInput): Promise<Note> {
    return httpClient.post<Note>('/notes', input);
  },

  async update(
    id: string,
    input: UpdateNoteInput,
    options?: { skipYjsState?: boolean | undefined }
  ): Promise<Note> {
    const body = options?.skipYjsState
      ? { ...input, skipYjsState: true }
      : input;
    return httpClient.patch<Note>(`/notes/${id}`, body);
  },

  async delete(id: string): Promise<{ success: boolean }> {
    return httpClient.delete<{ success: boolean }>(`/notes/${id}`);
  },

  async restore(id: string): Promise<Note> {
    return httpClient.post<Note>(`/notes/${id}/restore`, {});
  },

  async share(noteId: string, input: ShareNoteInput): Promise<NotePermission> {
    return httpClient.post<NotePermission>(`/notes/${noteId}/share`, input);
  },

  async getCollaborators(noteId: string): Promise<NoteCollaborator[]> {
    return httpClient.get<NoteCollaborator[]>(`/notes/${noteId}/collaborators`);
  },

  async revokeAccess(
    noteId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    return httpClient.delete<{ success: boolean }>(
      `/notes/${noteId}/share/${userId}`
    );
  },

  /**
   * Get a note by share token (public, no auth required)
   */
  async getNoteByToken(
    token: string
  ): Promise<NoteWithOwner & { accessLevel: NoteAccessLevel }> {
    return httpClient.get<NoteWithOwner & { accessLevel: NoteAccessLevel }>(
      `/notes/shared/${token}`,
      { skipAuth: true }
    );
  },
};
