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
  embedQuery(text: string): Promise<QueryEmbedding>;
  embedDocuments(texts: string[]): Promise<EmbeddingResult>;
}

export const EMBEDDING_PORT = Symbol('EMBEDDING_PORT');
