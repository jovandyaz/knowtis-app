export interface QueryEmbedding {
  readonly vector: number[];
  readonly costUsd: number;
}

export interface EmbeddingResult {
  readonly embeddings: number[][];
  readonly totalTokens: number;
  readonly costUsd: number;
}

export interface EmbeddingPort {
  /** False when the provider has no API key; callers skip embeddings instead of failing per request. */
  isConfigured(): boolean;
  embedQuery(text: string): Promise<QueryEmbedding>;
  embedDocuments(texts: string[]): Promise<EmbeddingResult>;
}

export const EMBEDDING_PORT = Symbol('EMBEDDING_PORT');
