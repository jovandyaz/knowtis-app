import type {
  TavilyConfig,
  TavilyExtractResponse,
  TavilySearchResponse,
  WebFetchResult,
  WebSearchOptions,
  WebSearchProvider,
  WebSearchResult,
} from './web-search.types';

const PRICE_PER_CREDIT_USD = 0.008; // Tavily $8 / 1k credits; basic search/extract = 1 credit

export class TavilyWebSearch implements WebSearchProvider {
  private readonly cfg: TavilyConfig;

  constructor(cfg: TavilyConfig) {
    this.cfg = cfg;
  }

  async search(
    query: string,
    options?: WebSearchOptions
  ): Promise<WebSearchResult> {
    const depth = options?.depth ?? this.cfg.depth;
    const json = await this.post<TavilySearchResponse>(
      'https://api.tavily.com/search',
      {
        query,
        search_depth: depth,
        max_results: options?.maxResults ?? this.cfg.maxResults,
        include_answer: 'basic',
        include_raw_content: false,
        topic: options?.topic ?? 'general',
      }
    );
    return {
      query,
      ...(json.answer !== undefined ? { answer: json.answer } : {}),
      hits: json.results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
      })),
      costUsd: (depth === 'advanced' ? 2 : 1) * PRICE_PER_CREDIT_USD,
    };
  }

  async fetch(url: string): Promise<WebFetchResult> {
    const json = await this.post<TavilyExtractResponse>(
      'https://api.tavily.com/extract',
      {
        urls: [url],
        extract_depth: 'basic',
        format: 'markdown',
      }
    );
    const first = json.results[0];
    if (!first) {
      const reason = json.failed_results?.[0]?.error ?? 'no content extracted';
      throw new Error(`Tavily extract failed for ${url}: ${reason}`);
    }
    return { url, content: first.raw_content, costUsd: PRICE_PER_CREDIT_USD };
  }

  private async post<T>(endpoint: string, body: unknown): Promise<T> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.cfg.timeoutMs),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Tavily ${endpoint} failed (${response.status}): ${detail}`
      );
    }
    return response.json() as Promise<T>;
  }
}
