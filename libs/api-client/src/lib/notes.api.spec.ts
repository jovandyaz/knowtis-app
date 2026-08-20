import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_NOTES_PAGE_SIZE } from '@knowtis/shared-types';

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
    const emptyPage = {
      items: [],
      total: 0,
      page: 1,
      limit: DEFAULT_NOTES_PAGE_SIZE,
    };

    it('always asks for a bounded page, even with no params', async () => {
      vi.mocked(httpClient.get).mockResolvedValue(emptyPage);
      await notesApi.getAll();
      expect(httpClient.get).toHaveBeenCalledWith(
        `/notes?page=1&limit=${DEFAULT_NOTES_PAGE_SIZE}`
      );
    });

    it('carries the requested page and size', async () => {
      vi.mocked(httpClient.get).mockResolvedValue(emptyPage);
      await notesApi.getAll({ page: 4, limit: 10 });
      expect(httpClient.get).toHaveBeenCalledWith('/notes?page=4&limit=10');
    });

    it('builds the query string from bucket and view', async () => {
      vi.mocked(httpClient.get).mockResolvedValue(emptyPage);
      await notesApi.getAll({ bucket: 'projects', view: 'mine' });
      expect(httpClient.get).toHaveBeenCalledWith(
        `/notes?page=1&limit=${DEFAULT_NOTES_PAGE_SIZE}&bucket=projects&view=mine`
      );
    });

    it('omits view when it is "all"', async () => {
      vi.mocked(httpClient.get).mockResolvedValue(emptyPage);
      await notesApi.getAll({ view: 'all' });
      expect(httpClient.get).toHaveBeenCalledWith(
        `/notes?page=1&limit=${DEFAULT_NOTES_PAGE_SIZE}`
      );
    });

    it('URLSearchParams-encodes a search term with a space as +', async () => {
      vi.mocked(httpClient.get).mockResolvedValue(emptyPage);
      await notesApi.getAll({ search: 'a b' });
      expect(httpClient.get).toHaveBeenCalledWith(
        `/notes?page=1&limit=${DEFAULT_NOTES_PAGE_SIZE}&search=a+b`
      );
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
