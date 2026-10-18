import type {
  ConversationSummary,
  ConversationTranscript,
  MessageKind,
  MessageStopReason,
} from '@knowtis/shared-types';

import type { AgentSource } from '../agent-event';
import type { AgentMessagePart, AgentRole } from '../agent-message';

export interface ConversationMessageRow {
  readonly role: AgentRole;
  readonly content: string;
  readonly sources: readonly AgentSource[];
  readonly parts: readonly AgentMessagePart[] | null;
  readonly stopReason: MessageStopReason | null;
  readonly turnId: string | null;
  readonly kind: MessageKind | null;
  readonly model: string | null;
}

export interface CreateConversationInput {
  readonly id: string;
  readonly userId: string;
  readonly noteId?: string;
  readonly title: string | null;
}

export interface PersistedTurnMessage {
  readonly role: AgentRole;
  readonly content: string;
  readonly parts?: readonly AgentMessagePart[];
  readonly sources?: readonly AgentSource[];
  readonly stopReason?: MessageStopReason;
  readonly kind?: MessageKind;
  readonly model?: string;
  /** The memories the turn's prompt received; only a terminal assistant row carries them. */
  readonly usedMemoryIds?: readonly string[];
}

export interface LastConversationMessage {
  readonly turnId: string | null;
  readonly role: AgentRole;
  readonly stopReason: MessageStopReason | null;
  readonly model: string | null;
}

export interface AppendTurnInput {
  readonly conversationId: string;
  readonly turnId: string;
  /** In order; an empty list is a no-op. */
  readonly messages: readonly PersistedTurnMessage[];
}

/** How long a conversation whose memory extraction failed waits, and how often it may fail, before it is given up on. */
export interface ExtractionRetryPolicy {
  /** Failures of one conversation state after which it is given up on until a new message changes it. */
  readonly maxAttempts: number;
  /** Wait after the first failure; each further failure of the same state doubles it. */
  readonly backoffBaseSeconds: number;
}

export interface ExtractableConversation {
  readonly id: string;
  readonly userId: string;
  /** The state that was read: `updated_at` as Postgres text, exact to the microsecond. */
  readonly version: string;
  /** Failures of that state so far; 0 when it never failed. */
  readonly attempts: number;
}

export interface ExtractionMessageRow extends ConversationMessageRow {
  readonly seq: number;
  /** Written after the owner last resumed long-term memory, or memory was never paused: only such a row may give the extractor text. */
  readonly afterResume: boolean;
}

/** What a memory extraction run reads of one conversation. */
export interface ExtractionWindow {
  /** The newest rows, oldest first, read as {@link ConversationRepository.loadMessages} reads them. */
  readonly rows: readonly ExtractionMessageRow[];
  /** Rows came before the window that no extraction run has read. */
  readonly uncheckedHistory: boolean;
  /** The first row of the first turn an earlier run found tainted; null when none has. */
  readonly taintedFromSeq: number | null;
}

/** What one run read, so a later run that no longer loads those rows still knows it. */
export interface ExtractionScan {
  /** The newest row the run read; null when it read none. */
  readonly checkedSeq: number | null;
  /** The first row of the first tainted turn the run found; null when it found none. */
  readonly taintedFromSeq: number | null;
}

/** A stored memory a run plans to change, at the version the run read. */
export interface MemoryVersionRef {
  readonly id: string;
  /** The memory's `updated_at` as Postgres text, as the run's memory list read it. */
  readonly version: string;
}

export interface ExtractionCommit {
  readonly userId: string;
  readonly conversationId: string;
  /** The state that was read, as {@link ExtractableConversation.version}. */
  readonly version: string;
  readonly deletes: readonly MemoryVersionRef[];
  readonly inserts: readonly { content: string; embedding: number[] }[];
  readonly updates: readonly (MemoryVersionRef & {
    readonly content: string;
    readonly embedding: number[];
  })[];
  readonly scan: ExtractionScan;
}

export interface ExtractionCommitResult {
  /** False when the owner paused long-term memory, or resumed it after the state the run read: nothing was written. */
  readonly committed: boolean;
  /** The memories whose update or delete was skipped because they changed after the run read them, deletes first. */
  readonly staleIds: readonly string[];
}

export interface ConversationRepository {
  create(input: CreateConversationInput): Promise<{ id: string }>;
  findByIdForUser(
    conversationId: string,
    userId: string
  ): Promise<{ id: string; model: string | null } | null>;
  setModel(
    conversationId: string,
    userId: string,
    model: string
  ): Promise<void>;
  /**
   * Oldest→newest, last `limit` rows, as `userId` may read them now: sources keep only the notes
   * they can still open, under each note's current title; a tool call on any other note has its input
   * replaced by `NOTE_UNAVAILABLE_INPUT`, and a tool result that involves one by `NOTE_UNAVAILABLE_OUTPUT`.
   */
  loadMessages(
    conversationId: string,
    userId: string,
    limit: number
  ): Promise<ConversationMessageRow[]>;
  /**
   * Single transaction: locks the conversation row first, so rows get their sequence numbers in commit order, then
   * appends every row of the turn and bumps `conversations.updatedAt`.
   * A turn whose user row is already stored is left as it is, so a replayed turn is never stored twice.
   * Resolves whether rows were stored: `false` for an empty turn or a replay.
   */
  appendTurn(input: AppendTurnInput): Promise<boolean>;
  /** Whether the conversation already stores the user row of `turnId`: a stored turn never runs again. */
  hasTurn(conversationId: string, turnId: string): Promise<boolean>;
  /**
   * Registered users' conversations idle for `quietSeconds` whose current state has no extracted memories yet,
   * oldest first. A state that failed is skipped while its backoff runs and for good once it has failed `retry.maxAttempts` times.
   * A user who paused long-term memory is skipped, and so is a state last changed before they resumed it.
   */
  findExtractable(
    quietSeconds: number,
    limit: number,
    retry: ExtractionRetryPolicy
  ): Promise<ExtractableConversation[]>;
  /** The newest `limit` rows of a conversation `userId` owns, with what earlier extraction runs recorded about the rows before them. */
  loadExtractionWindow(
    conversationId: string,
    userId: string,
    limit: number
  ): Promise<ExtractionWindow>;
  /**
   * In one transaction: applies the deletes, then the inserts and updates (each stamped with the conversation as its
   * source), stamps state `version` as extracted and clears its failures (a stamp that writes nothing once a new message
   * has moved the conversation past it), and records the scan. Writes nothing and resolves false when the owner has
   * paused long-term memory, or resumed it after `version`. It first gives an owner who never chose a settings row
   * holding the defaults and locks that row, so a concurrent pause either lands first or waits for the commit. An update
   * or delete of a memory changed or deleted after the run read it is skipped, so a user edit always wins.
   */
  commitExtraction(commit: ExtractionCommit): Promise<ExtractionCommitResult>;
  /**
   * Counts one failed extraction of state `version` and resolves how many it has had, or null when nothing was
   * counted: `userId` owns no such conversation, or a new message has moved it past `version` (a state that starts with no failures).
   */
  recordExtractionFailure(
    userId: string,
    conversationId: string,
    version: string
  ): Promise<number | null>;
  listForUser(
    userId: string,
    page: { offset: number; limit: number }
  ): Promise<{ items: ConversationSummary[]; total: number }>;
  /** The newest stored row of a conversation `userId` owns; null when it has none or is not theirs. */
  findLastMessage(
    conversationId: string,
    userId: string
  ): Promise<LastConversationMessage | null>;
  /** Sources keep only the notes `userId` can still open, under each note's current title. */
  loadTranscriptForUser(
    conversationId: string,
    userId: string,
    limit: number
  ): Promise<ConversationTranscript | null>;
  rename(
    conversationId: string,
    userId: string,
    title: string
  ): Promise<boolean>;
  deleteForUser(conversationId: string, userId: string): Promise<boolean>;
}

export const CONVERSATION_REPOSITORY = Symbol('CONVERSATION_REPOSITORY');
