import { describe, expect, it, vi } from 'vitest';

import type { KnowtisApiClient } from '../api-client/client.js';
import { NotesApi } from '../api-client/notes.api.js';

describe('NotesApi', () => {
  it('should POST to the restore endpoint and return the restored note', async () => {
    const restored = { id: 'note-1', title: 'Back' };
    const client = {
      post: vi.fn().mockResolvedValue(restored),
    } as unknown as KnowtisApiClient;
    const api = new NotesApi(client);

    const result = await api.restore('jwt-token', 'note-1');

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/notes/note-1/restore',
      'jwt-token'
    );
    expect(result).toEqual(restored);
  });
});
