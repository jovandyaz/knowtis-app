import type {
  CreateNoteInput,
  Note,
  NoteAccessLevel,
  NotePermission,
  NoteWithOwner,
  ShareNoteInput,
  UpdateNoteInput,
} from '@knowtis/shared-types';

import { httpClient } from './http-client';

/**
 * Extended note type with access level
 */
export interface NoteWithAccess extends Note {
  accessLevel: NoteAccessLevel;
}

/**
 * Notes query parameters
 */
export interface NotesQueryParams {
  search?: string;
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
  /**
   * Get all accessible notes
   */
  async getAll(params?: NotesQueryParams): Promise<NoteWithAccess[]> {
    const queryString = params?.search
      ? `?search=${encodeURIComponent(params.search)}`
      : '';

    return httpClient.get<NoteWithAccess[]>(`/notes${queryString}`);
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
