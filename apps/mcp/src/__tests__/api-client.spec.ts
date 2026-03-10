import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, KnowtisApiClient } from '../api-client/client.js';

describe('KnowtisApiClient', () => {
  let client: KnowtisApiClient;

  beforeEach(() => {
    client = new KnowtisApiClient('http://localhost:3333');
  });

  it('should make authenticated GET request', async () => {
    const mockResponse = [{ id: '1', title: 'Test Note' }];
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    const result = await client.get('/api/v1/notes', 'jwt-token');
    expect(result).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3333/api/v1/notes',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt-token',
        }),
      })
    );
  });

  it('should throw ApiError on non-ok response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Not found' }), { status: 404 })
    );

    await expect(client.get('/api/v1/notes/123', 'token')).rejects.toThrow(
      ApiError
    );
  });

  it('should make POST request with body', async () => {
    const mockResponse = { id: '1', title: 'New Note' };
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 201 })
    );

    const result = await client.post('/api/v1/notes', 'jwt-token', {
      title: 'New Note',
    });
    expect(result).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3333/api/v1/notes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'New Note' }),
      })
    );
  });

  it('should handle 204 No Content response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 204 })
    );

    await expect(
      client.delete('/api/v1/notes/1', 'token')
    ).resolves.toBeUndefined();
  });

  it('should include error message from response body', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })
    );

    await expect(client.get('/api/v1/notes', 'bad-token')).rejects.toThrow(
      'Unauthorized'
    );
  });
});
