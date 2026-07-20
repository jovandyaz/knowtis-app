import { afterEach, describe, expect, it, vi } from 'vitest';

import { TavilyWebSearch } from './tavily-web-search';

const PAY_AS_YOU_GO_CREDIT_USD = 0.008;

const cfg = {
  apiKey: 'tvly-x',
  maxResults: 5,
  depth: 'basic' as const,
  timeoutMs: 30000,
  pricePerCreditUsd: PAY_AS_YOU_GO_CREDIT_USD,
};

function mockFetchOnce(status: number, body: unknown): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

describe('TavilyWebSearch', () => {
  afterEach(() => vi.restoreAllMocks());

  it('should map a search response to hits + answer + basic-depth cost', async () => {
    mockFetchOnce(200, {
      answer: 'an answer',
      results: [
        { title: 'A', url: 'https://a.com', content: 'body', score: 0.9 },
      ],
    });
    const r = await new TavilyWebSearch(cfg).search('react 20');
    expect(r.query).toBe('react 20');
    expect(r.answer).toBe('an answer');
    expect(r.hits).toEqual([
      { title: 'A', url: 'https://a.com', content: 'body', score: 0.9 },
    ]);
    expect(r.costUsd).toBeCloseTo(0.008, 6);
  });

  it('should throw with status on a non-200 search', async () => {
    mockFetchOnce(429, { error: 'rate limited' });
    await expect(new TavilyWebSearch(cfg).search('x')).rejects.toThrow(/429/);
  });

  it('should map an extract response to fetched content with one credit cost', async () => {
    mockFetchOnce(200, {
      results: [{ url: 'https://a.com', raw_content: '# Title\nbody' }],
    });
    const r = await new TavilyWebSearch(cfg).fetch('https://a.com');
    expect(r.url).toBe('https://a.com');
    expect(r.content).toBe('# Title\nbody');
    expect(r.title).toBeUndefined();
    expect(r.costUsd).toBeCloseTo(0.008, 6);
  });

  it('should throw with the failure reason when extract returns no content', async () => {
    mockFetchOnce(200, {
      results: [],
      failed_results: [{ url: 'https://a.com', error: 'unreachable' }],
    });
    await expect(
      new TavilyWebSearch(cfg).fetch('https://a.com')
    ).rejects.toThrow(/unreachable/);
  });

  it('should reject a non-http(s) url without calling the network', async () => {
    const netSpy = vi.spyOn(globalThis, 'fetch');
    await expect(
      new TavilyWebSearch(cfg).fetch('javascript:alert(1)')
    ).rejects.toThrow(/non-http/);
    expect(netSpy).not.toHaveBeenCalled();
  });

  it('should charge two credits for an advanced search', async () => {
    mockFetchOnce(200, { results: [] });
    const r = await new TavilyWebSearch({
      ...cfg,
      depth: 'advanced',
    }).search('x');
    expect(r.costUsd).toBeCloseTo(PAY_AS_YOU_GO_CREDIT_USD * 2, 6);
  });

  it('should report zero cost on an included-credit plan', async () => {
    mockFetchOnce(200, { results: [] });
    const r = await new TavilyWebSearch({
      ...cfg,
      pricePerCreditUsd: 0,
    }).search('x');
    expect(r.costUsd).toBe(0);
  });
});
