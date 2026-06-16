export interface WebSearchHit {
  readonly title: string;
  readonly url: string;
  readonly content: string;
  readonly score: number;
}

export interface WebSearchResult {
  readonly query: string;
  readonly answer?: string;
  readonly hits: readonly WebSearchHit[];
  readonly costUsd: number;
}

export interface WebFetchResult {
  readonly url: string;
  readonly title?: string;
  readonly content: string;
  readonly costUsd: number;
}

export interface WebSearchOptions {
  readonly maxResults?: number;
  readonly depth?: 'basic' | 'advanced';
  readonly topic?: 'general' | 'news';
}

export interface WebSearchProvider {
  search(query: string, options?: WebSearchOptions): Promise<WebSearchResult>;
  fetch(url: string): Promise<WebFetchResult>;
}

export interface TavilyConfig {
  readonly apiKey: string;
  readonly maxResults: number;
  readonly depth: 'basic' | 'advanced';
  readonly timeoutMs: number;
}

export interface TavilySearchResponse {
  readonly answer?: string;
  readonly results: {
    title: string;
    url: string;
    content: string;
    score: number;
  }[];
}

export interface TavilyExtractResponse {
  readonly results: { url: string; raw_content: string }[];
  readonly failed_results?: { url: string; error: string }[];
}
