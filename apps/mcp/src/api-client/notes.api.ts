import type { KnowtisApiClient } from './client.js';

export interface NoteResponse {
  id: string;
  title: string;
  content: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export class NotesApi {
  private readonly client: KnowtisApiClient;

  constructor(client: KnowtisApiClient) {
    this.client = client;
  }

  async list(
    token: string,
    search?: string,
    limit?: number
  ): Promise<NoteResponse[]> {
    const params = new URLSearchParams();
    if (search) {
      params.set('search', search);
    }
    if (limit) {
      params.set('limit', String(limit));
    }
    const query = params.toString();
    return this.client.get(`/api/v1/notes${query ? `?${query}` : ''}`, token);
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
}
