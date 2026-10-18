import { beforeEach, describe, expect, it, vi } from 'vitest';

import { httpClient } from './http-client';
import { memoriesApi } from './memories.api';

vi.mock('./http-client', () => ({
  httpClient: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const ID = '00000000-0000-4000-8000-0000000006c3';

describe('memoriesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the memories', async () => {
    vi.mocked(httpClient.get).mockResolvedValue([]);

    await expect(memoriesApi.list()).resolves.toEqual([]);

    expect(httpClient.get).toHaveBeenCalledWith('/agent/memories');
  });

  it('edits one memory with the text in the body', async () => {
    vi.mocked(httpClient.patch).mockResolvedValue({});

    await memoriesApi.edit(ID, 'I live in Lima');

    expect(httpClient.patch).toHaveBeenCalledWith(`/agent/memories/${ID}`, {
      content: 'I live in Lima',
    });
  });

  it('forgets one memory by id', async () => {
    vi.mocked(httpClient.delete).mockResolvedValue({});

    await memoriesApi.remove(ID);

    expect(httpClient.delete).toHaveBeenCalledWith(`/agent/memories/${ID}`);
  });

  it('forgets every memory and reports how many', async () => {
    vi.mocked(httpClient.delete).mockResolvedValue({ deleted: 3 });

    await expect(memoriesApi.removeAll()).resolves.toEqual({ deleted: 3 });

    expect(httpClient.delete).toHaveBeenCalledWith('/agent/memories');
  });

  it('keeps a hostile id inside its path segment', async () => {
    vi.mocked(httpClient.delete).mockResolvedValue({});

    await memoriesApi.remove('../conversations?x=1');

    expect(httpClient.delete).toHaveBeenCalledWith(
      '/agent/memories/..%2Fconversations%3Fx%3D1'
    );
  });
});
