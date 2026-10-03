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

export interface LoadMessagesOptions {
  /** Skip tool rows and assistant rows without text — for readers that only understand text. */
  readonly textOnly?: boolean;
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
    limit: number,
    options?: LoadMessagesOptions
  ): Promise<ConversationMessageRow[]>;
  /**
   * Single transaction: appends every row of the turn and bumps `conversations.updatedAt`.
   * A turn whose user row is already stored is left as it is, so a replayed turn is never stored twice.
   * Resolves whether rows were stored: `false` for an empty turn or a replay.
   */
  appendTurn(input: AppendTurnInput): Promise<boolean>;
  /** Whether the conversation already stores the user row of `turnId`: a stored turn never runs again. */
  hasTurn(conversationId: string, turnId: string): Promise<boolean>;
  /**
   * Registered users' conversations idle for `quietSeconds` whose current state has no extracted memories yet,
   * oldest first. A state that failed is skipped while its backoff runs and for good once it has failed `retry.maxAttempts` times.
   */
  findExtractable(
    quietSeconds: number,
    limit: number,
    retry: ExtractionRetryPolicy
  ): Promise<ExtractableConversation[]>;
  /** Stamps state `version` as extracted and clears its failures; writes nothing once a new message has moved the conversation past it. */
  markExtracted(
    userId: string,
    conversationId: string,
    version: string
  ): Promise<void>;
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
