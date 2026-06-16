export interface UserMemoryRow {
  readonly id: string;
  readonly content: string;
}

export interface MemoryMatch {
  readonly id: string;
  readonly content: string;
  readonly score: number;
}

export interface UpsertMemoryInput {
  readonly userId: string;
  readonly content: string;
  readonly embedding: number[];
  readonly sourceConversationId?: string;
}

export interface MemoryRepository {
  listForUser(userId: string, limit: number): Promise<UserMemoryRow[]>;
  searchForUser(
    userId: string,
    queryEmbedding: number[],
    k: number
  ): Promise<MemoryMatch[]>;
  insert(input: UpsertMemoryInput): Promise<{ id: string }>;
  update(
    userId: string,
    id: string,
    content: string,
    embedding: number[]
  ): Promise<void>;
  deleteForUser(userId: string, id: string): Promise<boolean>;
  deleteAllForUser(userId: string): Promise<number>;
  countForUser(userId: string): Promise<number>;
}

export const MEMORY_REPOSITORY = Symbol('MEMORY_REPOSITORY');
