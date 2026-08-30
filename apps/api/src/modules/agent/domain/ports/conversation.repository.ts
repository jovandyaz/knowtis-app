import type { AgentSource } from '../agent-event';
import type { AgentRole } from '../agent-message';

export interface ConversationMessageRow {
  readonly role: AgentRole;
  readonly content: string;
  readonly sources: readonly AgentSource[];
}

export interface CreateConversationInput {
  readonly userId: string;
  readonly noteId?: string;
  readonly title: string;
}

export interface AppendTurnInput {
  readonly conversationId: string;
  readonly userMessage?: { readonly content: string };
  readonly assistantMessage?: {
    readonly content: string;
    readonly sources: readonly AgentSource[];
  };
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
  /** Oldest→newest, last `limit` messages. */
  loadMessages(
    conversationId: string,
    limit: number
  ): Promise<ConversationMessageRow[]>;
  /** Single transaction: appends the present turn rows and bumps `conversations.updatedAt`. No-op when both messages are absent. */
  appendTurn(input: AppendTurnInput): Promise<void>;
  findExtractable(
    quietSeconds: number,
    limit: number
  ): Promise<{ id: string; userId: string }[]>;
  markExtracted(userId: string, conversationId: string): Promise<void>;
}

export const CONVERSATION_REPOSITORY = Symbol('CONVERSATION_REPOSITORY');
