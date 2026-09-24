import type {
  ConversationSummary,
  ConversationTranscript,
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
  findExtractable(
    quietSeconds: number,
    limit: number
  ): Promise<{ id: string; userId: string }[]>;
  markExtracted(userId: string, conversationId: string): Promise<void>;
  listForUser(
    userId: string,
    page: { offset: number; limit: number }
  ): Promise<{ items: ConversationSummary[]; total: number }>;
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
