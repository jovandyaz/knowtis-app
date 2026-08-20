import { beforeEach, describe, expect, it, vi } from 'vitest';

import { httpClient } from './http-client';
import { notesApi } from './notes.api';

vi.mock('./http-client', () => ({
  httpClient: { get: vi.fn() },
}));

describe('notesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('hits bare /notes with no params', async () => {
      vi.mocked(httpClient.get).mockResolvedValue([]);
      await notesApi.getAll();
      expect(httpClient.get).toHaveBeenCalledWith('/notes');
    });

    it('builds the query string from bucket and view', async () => {
      vi.mocked(httpClient.get).mockResolvedValue([]);
      await notesApi.getAll({ bucket: 'projects', view: 'mine' });
      expect(httpClient.get).toHaveBeenCalledWith(
        '/notes?bucket=projects&view=mine'
      );
    });

    it('omits view when it is "all"', async () => {
      vi.mocked(httpClient.get).mockResolvedValue([]);
      await notesApi.getAll({ view: 'all' });
      expect(httpClient.get).toHaveBeenCalledWith('/notes');
    });

    it('URLSearchParams-encodes a search term with a space as +', async () => {
      vi.mocked(httpClient.get).mockResolvedValue([]);
      await notesApi.getAll({ search: 'a b' });
      expect(httpClient.get).toHaveBeenCalledWith('/notes?search=a+b');
    });
  });

  describe('getCounts', () => {
    it('hits GET /notes/counts', async () => {
      vi.mocked(httpClient.get).mockResolvedValue({
        inbox: 0,
        projects: 0,
        areas: 0,
        resources: 0,
        archive: 0,
      });
      await notesApi.getCounts();
      expect(httpClient.get).toHaveBeenCalledWith('/notes/counts');
    });
  });
});
