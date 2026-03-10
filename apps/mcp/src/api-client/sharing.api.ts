import type { KnowtisApiClient } from './client.js';

export interface Collaborator {
  userId: string;
  email: string;
  name: string;
  permission: 'owner' | 'viewer' | 'editor';
}

export class SharingApi {
  private readonly client: KnowtisApiClient;

  constructor(client: KnowtisApiClient) {
    this.client = client;
  }

  async getCollaborators(
    token: string,
    noteId: string
  ): Promise<Collaborator[]> {
    return this.client.get(`/api/v1/notes/${noteId}/collaborators`, token);
  }

  async share(
    token: string,
    noteId: string,
    userId: string,
    permission: 'viewer' | 'editor'
  ): Promise<unknown> {
    return this.client.post(`/api/v1/notes/${noteId}/share`, token, {
      userId,
      permission,
    });
  }
}
