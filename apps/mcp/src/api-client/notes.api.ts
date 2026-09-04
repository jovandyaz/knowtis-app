import type { KnowtisApiClient } from './client.js';

export interface NoteResponse {
  id: string;
  title: string;
  content: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotesPageResponse {
  items: NoteResponse[];
  total: number;
  page: number;
  limit: number;
}

export class NotesApi {
  private readonly client: KnowtisApiClient;

  constructor(client: KnowtisApiClient) {
    this.client = client;
  }

  async list(
    token: string,
    { search, page, limit }: { search?: string; page: number; limit: number }
  ): Promise<NotesPageResponse> {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (search) {
      params.set('search', search);
    }
    return this.client.get(`/api/v1/notes?${params.toString()}`, token);
  }

  async get(token: string, noteId: string): Promise<NoteResponse> {
    return this.client.get(`/api/v1/notes/${noteId}`, token);
  }

  async create(
    token: string,
    title: string,
    content?: string
  ): Promise<NoteResponse> {
    return this.client.post('/api/v1/notes', token, { title, content });
  }

  async update(
    token: string,
    noteId: string,
    data: { title?: string; content?: string }
  ): Promise<NoteResponse> {
    return this.client.patch(`/api/v1/notes/${noteId}`, token, data);
  }

  async delete(token: string, noteId: string): Promise<void> {
    return this.client.delete(`/api/v1/notes/${noteId}`, token);
  }

  async restore(token: string, noteId: string): Promise<NoteResponse> {
    return this.client.post(`/api/v1/notes/${noteId}/restore`, token);
  }
}
