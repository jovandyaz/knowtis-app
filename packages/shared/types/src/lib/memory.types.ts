/** The longest memory that is stored, and the most of one a prompt ever receives. */
export const MEMORY_MAX_CHARS = 300;

/** Whether long-term memory is on for a user who never chose: on, until they pause it. */
export const MEMORY_ENABLED_BY_DEFAULT = true;

/** Error `code` of a memory edit the server refuses to store; `details.reason` says why. */
export const AGENT_MEMORY_REJECTED_CODE = 'AGENT_MEMORY_REJECTED';

/**
 * Why a memory edit was refused: `content_policy` for a link, an email address, markup, code or an
 * invisible character, `injection` for text the injection guard reads as an instruction.
 */
export const MEMORY_EDIT_REJECTION_REASONS = [
  'content_policy',
  'injection',
] as const;

export type MemoryEditRejectionReason =
  (typeof MEMORY_EDIT_REJECTION_REASONS)[number];

/** Error `code` of a memory edit the server could not process now; `details.reason` says why. */
export const AGENT_MEMORY_UNAVAILABLE_CODE = 'AGENT_MEMORY_UNAVAILABLE';

/**
 * Why a memory edit could not be processed: `screening_unavailable` when the injection classifier could
 * not decide and `embeddings_failed` when the embedding provider failed, both with `Retry-After`, and
 * `embeddings_unavailable` when this server has no embedding provider configured, which a retry does
 * not change.
 */
export const MEMORY_EDIT_UNAVAILABLE_REASONS = [
  'screening_unavailable',
  'embeddings_unavailable',
  'embeddings_failed',
] as const;

export type MemoryEditUnavailableReason =
  (typeof MEMORY_EDIT_UNAVAILABLE_REASONS)[number];

export interface UserMemorySource {
  conversationId: string;
  title: string | null;
}

export interface UserMemoryItem {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  /** The conversation that last wrote the memory; a user edit keeps it, and it is null once that conversation is deleted. */
  source: UserMemorySource | null;
  /** The memory fails recall screening, so no prompt receives it; it still counts toward the per-user cap until it is deleted. */
  withheld: boolean;
}

/** A memory a turn put into its prompt. */
export interface RecalledMemory {
  id: string;
  content: string;
}
