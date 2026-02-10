import type {
  CreateNoteInput,
  Note,
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
  accessLevel: 'owner' | 'editor' | 'viewer';
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

/**
 * Notes API client
 * Handles CRUD operations and sharing
 */
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

  /**
   * Get a single note by ID
   */
  async getById(id: string): Promise<NoteWithOwner & { accessLevel: string }> {
    return httpClient.get<NoteWithOwner & { accessLevel: string }>(
      `/notes/${id}`
    );
  },

  /**
   * Create a new note
   */
  async create(input: CreateNoteInput): Promise<Note> {
    return httpClient.post<Note>('/notes', input);
  },

  /**
   * Update an existing note
   */
  async update(id: string, input: UpdateNoteInput): Promise<Note> {
    return httpClient.patch<Note>(`/notes/${id}`, input);
  },

  /**
   * Delete a note
   */
  async delete(id: string): Promise<{ success: boolean }> {
    return httpClient.delete<{ success: boolean }>(`/notes/${id}`);
  },

  /**
   * Share a note with another user
   */
  async share(noteId: string, input: ShareNoteInput): Promise<NotePermission> {
    return httpClient.post<NotePermission>(`/notes/${noteId}/share`, input);
  },

  /**
   * Get all collaborators of a note
   */
  async getCollaborators(noteId: string): Promise<NoteCollaborator[]> {
    return httpClient.get<NoteCollaborator[]>(`/notes/${noteId}/collaborators`);
  },

  /**
   * Revoke access from a user
   */
  async revokeAccess(
    noteId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    return httpClient.delete<{ success: boolean }>(
      `/notes/${noteId}/share/${userId}`
    );
  },
};
