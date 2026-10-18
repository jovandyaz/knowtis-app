export interface UserMemoryRow {
  readonly id: string;
  readonly content: string;
}

/** A stored memory as a run read it. */
export interface VersionedMemoryRow extends UserMemoryRow {
  /** `updated_at` as Postgres text, exact to the microsecond. */
  readonly version: string;
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

/** A stored memory with the conversation that last wrote it. */
export interface StoredMemory {
  readonly id: string;
  readonly content: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Null once that conversation is deleted, or for a memory no conversation wrote. */
  readonly source: {
    readonly conversationId: string;
    readonly title: string | null;
  } | null;
}

export interface MemoryRepository {
  listForUser(userId: string, limit: number): Promise<VersionedMemoryRow[]>;
  /** The newest-updated memories first. */
  listWithSources(userId: string, limit: number): Promise<StoredMemory[]>;
  findForUser(userId: string, id: string): Promise<UserMemoryRow | null>;
  searchForUser(
    userId: string,
    queryEmbedding: number[],
    k: number
  ): Promise<MemoryMatch[]>;
  insert(input: UpsertMemoryInput): Promise<{ id: string }>;
  /** Replaces the content and embedding and stamps `updated_at`, keeping the memory's source; false when `userId` has no such memory. */
  update(
    userId: string,
    id: string,
    content: string,
    embedding: number[]
  ): Promise<boolean>;
  deleteForUser(userId: string, id: string): Promise<boolean>;
  deleteAllForUser(userId: string): Promise<number>;
  countForUser(userId: string): Promise<number>;
  /** Whether the user has long-term memory on; true until they pause it. */
  isEnabledFor(userId: string): Promise<boolean>;
}

export const MEMORY_REPOSITORY = Symbol('MEMORY_REPOSITORY');
