import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { TavilyWebSearch } from '@knowtis/ai-gateway';
import type {
  WebFetchResult,
  WebSearchOptions,
  WebSearchResult,
} from '@knowtis/ai-gateway';

import type { EnvConfig } from '../../../../config/env.config';
import type { WebSearchPort } from '../../domain/ports/web-search.port';

@Injectable()
export class TavilyWebSearchAdapter implements WebSearchPort {
  private readonly logger = new Logger(TavilyWebSearchAdapter.name);

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async search(
    query: string,
    options?: WebSearchOptions
  ): Promise<WebSearchResult> {
    const r = await this.client().search(query, options);
    this.logger.log(
      `web.search hits=${r.hits.length} ~= $${r.costUsd.toFixed(6)}`
    );
    return r;
  }

  async fetch(url: string): Promise<WebFetchResult> {
    const r = await this.client().fetch(url);
    this.logger.log(`web.fetch ~= $${r.costUsd.toFixed(6)}`);
    return r;
  }

  private client(): TavilyWebSearch {
    const apiKey = this.config.get('TAVILY_API_KEY');
    if (!apiKey) {
      throw new Error('TAVILY_API_KEY is not set');
    }
    return new TavilyWebSearch({
      apiKey,
      maxResults: this.config.get('AI_WEB_SEARCH_MAX_RESULTS'),
      depth: this.config.get('AI_WEB_SEARCH_DEPTH'),
      timeoutMs: this.config.get('AI_TIMEOUT_MS'),
    });
  }
}
