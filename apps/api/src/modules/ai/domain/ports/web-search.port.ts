import type { WebSearchProvider } from '@knowtis/ai-gateway';

export interface WebSearchPort extends WebSearchProvider {
  /** False when the provider has no API key; the web tool group is then not offered to the model. */
  isConfigured(): boolean;
}

export const WEB_SEARCH_PORT = Symbol('WEB_SEARCH_PORT');
