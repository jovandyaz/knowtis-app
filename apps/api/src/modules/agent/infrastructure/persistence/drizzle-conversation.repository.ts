import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  isNotNull,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';

import type {
  ConversationSummary,
  ConversationTranscript,
} from '@knowtis/shared-types';

import {
  conversationMessages,
  conversations,
  DATABASE_CONNECTION,
  notes,
  users,
  type Database,
} from '../../../../database';
import { readableNoteCondition } from '../../../notes/infrastructure/persistence/readable-note.condition';
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
import { alignTranscriptWindow } from '../../domain/transcript-window';

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

const HAS_MESSAGES = sql`EXISTS (SELECT 1 FROM ${conversationMessages} WHERE ${conversationMessages.conversationId} = ${conversations.id})`;

const DISPLAYED_ROW = and(
  ne(conversationMessages.role, 'tool'),
  or(
    ne(conversationMessages.content, ''),
    and(
      eq(conversationMessages.role, 'assistant'),
      isNotNull(conversationMessages.stopReason)
    )
  )
);

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
        noteId: input.noteId
          ? this.readableNoteId(input.noteId, input.userId)
          : null,
        title: input.title,
      })
      .returning({ id: conversations.id });
    return { id: row.id };
  }

  private readableNoteId(noteId: string, userId: string): SQL {
    const readable = this.db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.id, noteId), readableNoteCondition(userId)));
    return sql`(${readable})`;
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

  async listForUser(
    userId: string,
    page: { offset: number; limit: number }
  ): Promise<{ items: ConversationSummary[]; total: number }> {
    const scope = and(eq(conversations.userId, userId), HAS_MESSAGES);
    const [rows, counted] = await Promise.all([
      this.db
        .select({
          id: conversations.id,
          title: conversations.title,
          noteId: notes.id,
          noteTitle: notes.title,
          updatedAt: conversations.updatedAt,
        })
        .from(conversations)
        .leftJoin(
          notes,
          and(eq(notes.id, conversations.noteId), readableNoteCondition(userId))
        )
        .where(scope)
        .orderBy(desc(conversations.updatedAt), desc(conversations.id))
        .limit(page.limit)
        .offset(page.offset),
      this.db.select({ value: count() }).from(conversations).where(scope),
    ]);
    return {
      items: rows.map((row) => ({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
      })),
      total: counted[0]?.value ?? 0,
    };
  }

  async loadTranscriptForUser(
    conversationId: string,
    userId: string,
    limit: number
  ): Promise<ConversationTranscript | null> {
    const [header] = await this.db
      .select({
        id: conversations.id,
        title: conversations.title,
        noteId: notes.id,
      })
      .from(conversations)
      .leftJoin(
        notes,
        and(eq(notes.id, conversations.noteId), readableNoteCondition(userId))
      )
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId)
        )
      )
      .limit(1);
    if (!header) {
      return null;
    }
    const newestFirst = await this.db
      .select({
        role: conversationMessages.role,
        content: conversationMessages.content,
        sources: conversationMessages.sources,
        stopReason: conversationMessages.stopReason,
        turnId: conversationMessages.turnId,
      })
      .from(conversationMessages)
      .innerJoin(
        conversations,
        eq(conversations.id, conversationMessages.conversationId)
      )
      .where(
        and(
          eq(conversationMessages.conversationId, conversationId),
          eq(conversations.userId, userId),
          DISPLAYED_ROW
        )
      )
      .orderBy(desc(conversationMessages.seq))
      .limit(limit + 1);
    const displayRows = newestFirst
      .slice(0, limit)
      .reverse()
      .flatMap((row) =>
        row.role === 'tool'
          ? []
          : [
              {
                turnId: row.turnId ?? null,
                role: row.role,
                content: row.content,
                sources: row.sources ?? [],
                stopReason: row.stopReason ?? null,
              },
            ]
      );
    const { rows, hasEarlier } = alignTranscriptWindow(
      displayRows,
      newestFirst.length > limit
    );
    return { ...header, hasEarlier, messages: rows };
  }
}
