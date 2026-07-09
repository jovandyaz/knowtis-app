import type { KnowtisApiClient } from './client.js';

export interface SearchHit {
  id: string;
  title: string;
  updatedAt: string;
  isOwner: boolean;
  isSharedWithMe: boolean;
  isPubliclyShared: boolean;
}

export class SearchApi {
  private readonly client: KnowtisApiClient;

  constructor(client: KnowtisApiClient) {
    this.client = client;
  }

  async search(
    token: string,
    query: string,
    limit?: number
  ): Promise<SearchHit[]> {
    const params = new URLSearchParams({ q: query });
    if (limit !== undefined) {
      params.set('limit', String(limit));
    }
    const { hits } = await this.client.get<{ hits: SearchHit[] }>(
      `/api/v1/search?${params.toString()}`,
      token
    );
    return hits;
  }
}
