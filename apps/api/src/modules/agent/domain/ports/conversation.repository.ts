import type { MessageStopReason } from '@knowtis/shared-types';

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
  readonly userId: string;
  readonly noteId?: string;
  readonly title: string;
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
  /** Oldest→newest, last `limit` rows. */
  loadMessages(
    conversationId: string,
    limit: number,
    options?: LoadMessagesOptions
  ): Promise<ConversationMessageRow[]>;
  /** Single transaction: appends every row of the turn and bumps `conversations.updatedAt`. */
  appendTurn(input: AppendTurnInput): Promise<void>;
  findExtractable(
    quietSeconds: number,
    limit: number
  ): Promise<{ id: string; userId: string }[]>;
  markExtracted(userId: string, conversationId: string): Promise<void>;
}

export const CONVERSATION_REPOSITORY = Symbol('CONVERSATION_REPOSITORY');
