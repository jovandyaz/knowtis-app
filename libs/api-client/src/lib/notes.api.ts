import {
  DEFAULT_NOTES_PAGE_SIZE,
  type CreateNoteInput,
  type Note,
  type NoteAccessLevel,
  type NoteBucketCounts,
  type NotePerson,
  type NotesListFilters,
  type NotesPage,
  type NoteSupertagCounts,
  type NoteWithOwner,
  type ShareNoteInput,
  type Supertag,
  type SupertagField,
  type UpdateNoteInput,
} from '@knowtis/shared-types';

import { httpClient } from './http-client';

/**
 * Extended note type with access level
 */
export interface NoteWithAccess extends Note {
  accessLevel: NoteAccessLevel;
  tags: string[];
}

export type NoteCounts = NoteBucketCounts & {
  supertags: NoteSupertagCounts;
};

export type SupertagCatalog = Record<Supertag, readonly SupertagField[]>;

/** A single note read: the owner block the list omits, plus its tag paths. */
export interface NoteDetail extends NoteWithOwner {
  accessLevel: NoteAccessLevel;
  tags: string[];
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
    if (params?.tag) {
      query.set('tag', params.tag);
    }
    if (params?.supertag) {
      query.set('supertag', params.supertag);
    }
    return httpClient.get<NotesPage<NoteWithAccess>>(
      `/notes?${query.toString()}`
    );
  },

  async getCounts(): Promise<NoteCounts> {
    return httpClient.get<NoteCounts>('/notes/counts');
  },

  /** Static field descriptors per note type; safe to cache for the session. */
  async getSupertagCatalog(): Promise<SupertagCatalog> {
    return httpClient.get<SupertagCatalog>('/notes/supertags');
  },

  async getById(id: string): Promise<NoteDetail> {
    return httpClient.get<NoteDetail>(`/notes/${id}`);
  },

  async create(input: CreateNoteInput): Promise<Note> {
    return httpClient.post<Note>('/notes', input);
  },

  async update(
    id: string,
    input: UpdateNoteInput,
    options?: { yjsState?: string | undefined }
  ): Promise<Note> {
    const body = options?.yjsState
      ? { ...input, yjsState: options.yjsState }
      : input;
    return httpClient.patch<Note>(`/notes/${id}`, body);
  },

  async delete(id: string): Promise<{ success: boolean }> {
    return httpClient.delete<{ success: boolean }>(`/notes/${id}`);
  },

  async restore(id: string): Promise<Note> {
    return httpClient.post<Note>(`/notes/${id}/restore`, {});
  },

  async rotateShareLink(noteId: string): Promise<Note> {
    return httpClient.post<Note>(`/notes/${noteId}/share-link/rotate`);
  },

  async upsertPerson(
    noteId: string,
    input: ShareNoteInput
  ): Promise<NotePerson> {
    return httpClient.post<NotePerson>(`/notes/${noteId}/share`, input);
  },
  async getPeople(noteId: string): Promise<NotePerson[]> {
    return httpClient.get<NotePerson[]>(`/notes/${noteId}/collaborators`);
  },
  async revokePerson(noteId: string, userId: string): Promise<void> {
    await httpClient.delete<unknown>(`/notes/${noteId}/share/${userId}`);
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
