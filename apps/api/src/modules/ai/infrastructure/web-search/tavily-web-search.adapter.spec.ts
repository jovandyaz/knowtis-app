import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../../config/env.config';
import { TavilyWebSearchAdapter } from './tavily-web-search.adapter';

function adapter(apiKey: string | undefined): TavilyWebSearchAdapter {
  const config = {
    get: (key: string) =>
      ({
        TAVILY_API_KEY: apiKey,
        AI_WEB_SEARCH_MAX_RESULTS: 5,
        AI_WEB_SEARCH_DEPTH: 'basic',
        AI_TIMEOUT_MS: 30000,
      })[key],
  } as unknown as ConfigService<EnvConfig, true>;
  return new TavilyWebSearchAdapter(config);
}

describe('TavilyWebSearchAdapter', () => {
  it('should throw when TAVILY_API_KEY is missing (checked per call, not at construction)', async () => {
    const a = adapter(undefined); // construction must NOT throw
    await expect(a.search('x')).rejects.toThrow(/TAVILY_API_KEY/);
  });

  it('should delegate search to the Tavily client and map results', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        answer: 'a',
        results: [{ title: 'T', url: 'https://t.co', content: 'c', score: 1 }],
      }),
      text: async () => '',
    } as Response);
    const r = await adapter('tvly-x').search('q');
    expect(r.hits[0]?.url).toBe('https://t.co');
    vi.restoreAllMocks();
  });
});
