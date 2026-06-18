import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import {
  conversationMessages,
  conversations,
  DATABASE_CONNECTION,
  users,
  type Database,
} from '../../../../database';
import type { AgentRole } from '../../domain/agent-message';
import type {
  AppendTurnInput,
  ConversationMessageRow,
  ConversationRepository,
  CreateConversationInput,
} from '../../domain/ports/conversation.repository';

@Injectable()
export class DrizzleConversationRepository implements ConversationRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async create(input: CreateConversationInput): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(conversations)
      .values({
        userId: input.userId,
        ...(input.noteId ? { noteId: input.noteId } : {}),
        title: input.title,
      })
      .returning({ id: conversations.id });
    return { id: row.id };
  }

  async findByIdForUser(
    conversationId: string,
    userId: string
  ): Promise<{ id: string; model: string | null } | null> {
    const [row] = await this.db
      .select({ id: conversations.id, model: conversations.model })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  async setModel(
    conversationId: string,
    userId: string,
    model: string
  ): Promise<void> {
    await this.db
      .update(conversations)
      .set({ model, updatedAt: sql`now()` })
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId)
        )
      )
      .returning({ id: conversations.id });
  }

  async loadMessages(
    conversationId: string,
    limit: number
  ): Promise<ConversationMessageRow[]> {
    const rows = await this.db
      .select({
        role: conversationMessages.role,
        content: conversationMessages.content,
        sources: conversationMessages.sources,
      })
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(desc(conversationMessages.seq))
      .limit(limit);
    return rows.reverse().map((r) => ({
      role: r.role,
      content: r.content,
      sources: r.sources ?? [],
    }));
  }

  async appendTurn(input: AppendTurnInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      const values: {
        conversationId: string;
        role: AgentRole;
        content: string;
        sources: { id: string; title: string }[] | null;
      }[] = [];
      if (input.userMessage) {
        values.push({
          conversationId: input.conversationId,
          role: 'user',
          content: input.userMessage.content,
          sources: null,
        });
      }
      values.push({
        conversationId: input.conversationId,
        role: 'assistant',
        content: input.assistantMessage.content,
        sources: Array.from(input.assistantMessage.sources),
      });
      await tx.insert(conversationMessages).values(values);
      await tx
        .update(conversations)
        .set({ updatedAt: sql`now()` })
        .where(eq(conversations.id, input.conversationId));
    });
  }

  async findExtractable(
    quietSeconds: number,
    limit: number
  ): Promise<{ id: string; userId: string }[]> {
    return this.db
      .select({ id: conversations.id, userId: conversations.userId })
      .from(conversations)
      .innerJoin(users, eq(users.id, conversations.userId))
      .where(
        sql`${users.isAnonymous} = false
            AND ${conversations.updatedAt} < now() - make_interval(secs => ${quietSeconds})
            AND (${conversations.memoriesExtractedAt} IS NULL
                 OR ${conversations.memoriesExtractedAt} < ${conversations.updatedAt})`
      )
      .orderBy(conversations.updatedAt)
      .limit(limit);
  }

  async markExtracted(userId: string, conversationId: string): Promise<void> {
    await this.db
      .update(conversations)
      .set({ memoriesExtractedAt: sql`now()` })
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId)
        )
      )
      .returning({ id: conversations.id });
  }
}
