export interface EmbeddingResult {
  readonly embeddings: number[][];
  readonly totalTokens: number;
}

export interface EmbeddingPort {
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<EmbeddingResult>;
}

export const EMBEDDING_PORT = Symbol('EMBEDDING_PORT');
