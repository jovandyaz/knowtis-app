import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports configured only when TAVILY_API_KEY is set', () => {
    expect(adapter('tvly-x').isConfigured()).toBe(true);
    expect(adapter(undefined).isConfigured()).toBe(false);
  });

  it('logs ai.capability.unavailable once at init when the key is missing', () => {
    const a = adapter(undefined);
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    a.onModuleInit();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith({
      event: 'ai.capability.unavailable',
      capability: 'web_search',
      env: 'TAVILY_API_KEY',
    });
  });

  it('stays quiet at init when the key is set', () => {
    const a = adapter('tvly-x');
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    a.onModuleInit();
    expect(warn).not.toHaveBeenCalled();
  });

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
  });

  it('should delegate fetch to the Tavily client and map extracted content', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        results: [{ url: 'https://t.co', raw_content: '# body' }],
      }),
      text: async () => '',
    } as Response);
    const r = await adapter('tvly-x').fetch('https://t.co');
    expect(r.url).toBe('https://t.co');
    expect(r.content).toBe('# body');
  });

  it('should propagate an upstream non-200 response as an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
      text: async () => 'unavailable',
    } as Response);
    await expect(adapter('tvly-x').search('q')).rejects.toThrow(/503/);
  });
});
