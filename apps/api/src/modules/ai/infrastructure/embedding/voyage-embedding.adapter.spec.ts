import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../../config/env.config';
import { VoyageEmbeddingAdapter } from './voyage-embedding.adapter';

function makeConfig(
  values: Record<string, unknown>
): ConfigService<EnvConfig, true> {
  return {
    get: (k: string) => values[k],
  } as unknown as ConfigService<EnvConfig, true>;
}

describe('VoyageEmbeddingAdapter', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    vi.clearAllMocks();
  });

  function ok(embeddings: number[][], tokens: number): Response {
    return {
      ok: true,
      json: () =>
        Promise.resolve({
          data: embeddings.map((embedding, index) => ({ embedding, index })),
          usage: { total_tokens: tokens },
        }),
    } as unknown as Response;
  }

  it('embedQuery sends input_type=query and returns the single vector', async () => {
    fetchSpy.mockResolvedValue(ok([[0.1, 0.2]], 3));
    const adapter = new VoyageEmbeddingAdapter(
      makeConfig({
        VOYAGE_API_KEY: 'k',
        AI_EMBEDDING_MODEL: 'voyage-4',
        AI_TIMEOUT_MS: 30000,
      })
    );

    const vec = await adapter.embedQuery('hello');

    expect(vec).toEqual([0.1, 0.2]);
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.input_type).toBe('query');
    expect(body.model).toBe('voyage-4');
    expect(body.output_dimension).toBe(1024);
  });

  it('embedDocuments sends input_type=document and returns vectors + tokens', async () => {
    fetchSpy.mockResolvedValue(
      ok(
        [
          [1, 0],
          [0, 1],
        ],
        10
      )
    );
    const adapter = new VoyageEmbeddingAdapter(
      makeConfig({
        VOYAGE_API_KEY: 'k',
        AI_EMBEDDING_MODEL: 'voyage-4',
        AI_TIMEOUT_MS: 30000,
      })
    );

    const result = await adapter.embedDocuments(['a', 'b']);

    expect(result.embeddings).toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(result.totalTokens).toBe(10);
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.input_type).toBe('document');
  });

  it('throws when VOYAGE_API_KEY is missing', async () => {
    const adapter = new VoyageEmbeddingAdapter(
      makeConfig({ AI_EMBEDDING_MODEL: 'voyage-4' })
    );
    await expect(adapter.embedQuery('x')).rejects.toThrow(/VOYAGE_API_KEY/);
  });

  it('throws when the response count does not match the input count', async () => {
    fetchSpy.mockResolvedValue(ok([[0.1, 0.2]], 3));
    const adapter = new VoyageEmbeddingAdapter(
      makeConfig({
        VOYAGE_API_KEY: 'k',
        AI_EMBEDDING_MODEL: 'voyage-4',
        AI_TIMEOUT_MS: 30000,
      })
    );
    await expect(adapter.embedDocuments(['a', 'b'])).rejects.toThrow(
      /2 inputs/
    );
  });

  it('throws on a non-ok HTTP response', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('rate limited'),
    } as unknown as Response);
    const adapter = new VoyageEmbeddingAdapter(
      makeConfig({
        VOYAGE_API_KEY: 'k',
        AI_EMBEDDING_MODEL: 'voyage-4',
        AI_TIMEOUT_MS: 30000,
      })
    );
    await expect(adapter.embedQuery('x')).rejects.toThrow(/Voyage/);
  });
});
