import { beforeEach, describe, expect, it, vi } from 'vitest';

import { conversationsApi } from './conversations.api';
import { httpClient } from './http-client';

vi.mock('./http-client', () => ({
  httpClient: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const ID = '00000000-0000-4000-8000-0000000004d1';

describe('conversationsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks for one page of conversations', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({});

    await conversationsApi.list({ page: 2, limit: 25 });

    expect(httpClient.get).toHaveBeenCalledWith(
      '/agent/conversations?page=2&limit=25'
    );
  });

  it('reads one transcript', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({});

    await conversationsApi.transcript(ID);

    expect(httpClient.get).toHaveBeenCalledWith(
      `/agent/conversations/${ID}/messages`,
      undefined
    );
  });

  it('lets the caller abort a transcript read', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({});
    const { signal } = new AbortController();

    await conversationsApi.transcript(ID, signal);

    expect(httpClient.get).toHaveBeenCalledWith(
      `/agent/conversations/${ID}/messages`,
      { signal }
    );
  });

  it('renames with the title in the body', async () => {
    vi.mocked(httpClient.patch).mockResolvedValue({});

    await conversationsApi.rename(ID, 'Trip');

    expect(httpClient.patch).toHaveBeenCalledWith(
      `/agent/conversations/${ID}`,
      {
        title: 'Trip',
      }
    );
  });

  it('deletes by id', async () => {
    vi.mocked(httpClient.delete).mockResolvedValue({});

    await conversationsApi.remove(ID);

    expect(httpClient.delete).toHaveBeenCalledWith(
      `/agent/conversations/${ID}`
    );
  });

  it('keeps a hostile id inside its path segment', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({});

    await conversationsApi.transcript('../admin?x=1');

    expect(httpClient.get).toHaveBeenCalledWith(
      '/agent/conversations/..%2Fadmin%3Fx%3D1/messages',
      undefined
    );
  });
});
