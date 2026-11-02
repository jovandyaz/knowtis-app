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

export interface WebSearchPort extends WebSearchProvider {
  /** False when the provider has no API key; the web tool group is then not offered to the model. */
  isConfigured(): boolean;
}

export const WEB_SEARCH_PORT = Symbol('WEB_SEARCH_PORT');
