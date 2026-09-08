import type { NotePerson, ShareNoteInput } from '@knowtis/shared-types';

import type { KnowtisApiClient } from './client.js';

export class SharingApi {
  private readonly client: KnowtisApiClient;
  constructor(client: KnowtisApiClient) {
    this.client = client;
  }
  async getPeople(token: string, noteId: string): Promise<NotePerson[]> {
    return this.client.get(`/api/v1/notes/${noteId}/collaborators`, token);
  }
  async upsertPerson(
    token: string,
    noteId: string,
    input: ShareNoteInput
  ): Promise<NotePerson> {
    return this.client.post(`/api/v1/notes/${noteId}/share`, token, input);
  }
}
