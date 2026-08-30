import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  conversationMessages,
  conversations,
  DATABASE_CONNECTION,
  users,
  type Database,
} from '../../../../database';
import {
  AGENT_MESSAGE_PARTS_VERSION,
  TOOL_OUTPUT_TYPE,
  type AgentMessagePart,
  type PersistedParts,
} from '../../domain/agent-message';
import type {
  AppendTurnInput,
  ConversationMessageRow,
  ConversationRepository,
  CreateConversationInput,
  LoadMessagesOptions,
} from '../../domain/ports/conversation.repository';

const agentMessagePartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('tool-call'),
    toolCallId: z.string(),
    toolName: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal('tool-result'),
    toolCallId: z.string(),
    toolName: z.string(),
    output: z.unknown(),
    outputType: z.enum(TOOL_OUTPUT_TYPE),
  }),
]);

const persistedPartsSchema = z.object({
  v: z.literal(AGENT_MESSAGE_PARTS_VERSION),
  parts: z.array(agentMessagePartSchema),
});

@Injectable()
export class DrizzleConversationRepository implements ConversationRepository {
  private readonly logger = new Logger(DrizzleConversationRepository.name);

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
    limit: number,
    options: LoadMessagesOptions = {}
  ): Promise<ConversationMessageRow[]> {
    const scope = eq(conversationMessages.conversationId, conversationId);
    const rows = await this.db
      .select({
        role: conversationMessages.role,
        content: conversationMessages.content,
        sources: conversationMessages.sources,
        parts: conversationMessages.parts,
        stopReason: conversationMessages.stopReason,
        turnId: conversationMessages.turnId,
      })
      .from(conversationMessages)
      .where(
        options.textOnly
          ? and(
              scope,
              ne(conversationMessages.role, 'tool'),
              ne(conversationMessages.content, '')
            )
          : scope
      )
      .orderBy(desc(conversationMessages.seq))
      .limit(limit);
    return rows.reverse().map((r) => ({
      role: r.role,
      content: r.content,
      sources: r.sources ?? [],
      parts: this.partsOf(r.parts, conversationId),
      stopReason: r.stopReason ?? null,
      turnId: r.turnId ?? null,
    }));
  }

  private partsOf(
    stored: PersistedParts | null,
    conversationId: string
  ): readonly AgentMessagePart[] | null {
    if (stored === null) {
      return null;
    }
    if (!persistedPartsSchema.safeParse(stored).success) {
      this.logger.warn({
        event: 'agent.transcript.parts_invalid',
        conversationId,
      });
      return null;
    }
    return stored.parts;
  }

  async appendTurn(input: AppendTurnInput): Promise<void> {
    if (input.messages.length === 0) {
      return;
    }
    const values = input.messages.map((m) => ({
      conversationId: input.conversationId,
      turnId: input.turnId,
      role: m.role,
      content: m.content,
      sources: m.sources ? Array.from(m.sources) : null,
      parts: m.parts
        ? ({
            v: AGENT_MESSAGE_PARTS_VERSION,
            parts: m.parts,
          } satisfies PersistedParts)
        : null,
      stopReason: m.stopReason ?? null,
    }));
    await this.db.transaction(async (tx) => {
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
