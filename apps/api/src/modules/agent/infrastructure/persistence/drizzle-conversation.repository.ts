import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  inArray,
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
import type { AgentSource } from '../../domain/agent-event';
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
import {
  noteIdsInToolResults,
  redactUnreadableToolResults,
} from '../../domain/tool-result-notes';
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

// A stored id that is not a uuid names no note, and casting one would fail the whole load.
const UUID_TEXT_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const UUID_TEXT = new RegExp(UUID_TEXT_PATTERN);

const TURN_USER_ROW = sql`${conversationMessages.role} = 'user' AND ${conversationMessages.turnId} IS NOT NULL`;

function readableSources(userId: string): SQL<AgentSource[]> {
  return sql<AgentSource[]>`(
    SELECT coalesce(
      jsonb_agg(jsonb_build_object('id', ${notes.id}, 'title', ${notes.title}) ORDER BY source.ordinal),
      '[]'::jsonb
    )
    FROM jsonb_array_elements(CASE
      WHEN jsonb_typeof(${conversationMessages.sources}) = 'array' THEN ${conversationMessages.sources}
      ELSE '[]'::jsonb
    END)
      WITH ORDINALITY AS source(entry, ordinal)
    JOIN ${notes} ON ${notes.id} = CASE
      WHEN source.entry ->> 'id' ~ ${UUID_TEXT_PATTERN} THEN (source.entry ->> 'id')::uuid
    END
    WHERE ${readableNoteCondition(userId)}
  )`;
}

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
    userId: string,
    limit: number,
    options: LoadMessagesOptions = {}
  ): Promise<ConversationMessageRow[]> {
    const scope = eq(conversationMessages.conversationId, conversationId);
    const newestFirst = await this.db
      .select({
        role: conversationMessages.role,
        content: conversationMessages.content,
        sources: readableSources(userId),
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
    const rows = newestFirst.reverse().map((r) => ({
      role: r.role,
      content: r.content,
      sources: r.sources,
      parts: this.partsOf(r.parts, conversationId),
      stopReason: r.stopReason ?? null,
      turnId: r.turnId ?? null,
    }));
    const readable = await this.readableNoteIds(
      noteIdsInToolResults(rows),
      userId
    );
    return redactUnreadableToolResults(rows, readable);
  }

  private async readableNoteIds(
    noteIds: readonly string[],
    userId: string
  ): Promise<ReadonlySet<string>> {
    const candidates = noteIds.filter((id) => UUID_TEXT.test(id));
    if (candidates.length === 0) {
      return new Set();
    }
    const readable = await this.db
      .select({ id: notes.id })
      .from(notes)
      .where(and(inArray(notes.id, candidates), readableNoteCondition(userId)));
    return new Set(readable.map((note) => note.id));
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

  async appendTurn(input: AppendTurnInput): Promise<boolean> {
    if (input.messages.length === 0) {
      return false;
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
    const [first, ...rest] = values;
    const claimsTurn = first.role === 'user';
    return this.db.transaction(async (tx) => {
      if (claimsTurn) {
        const claimed = await tx
          .insert(conversationMessages)
          .values(first)
          .onConflictDoNothing({
            target: [
              conversationMessages.conversationId,
              conversationMessages.turnId,
            ],
            where: TURN_USER_ROW,
          })
          .returning({ id: conversationMessages.id });
        if (claimed.length === 0) {
          this.logger.warn({
            event: 'agent.turn.duplicate_persist',
            conversationId: input.conversationId,
            turnId: input.turnId,
          });
          return false;
        }
      }
      const unclaimed = claimsTurn ? rest : values;
      if (unclaimed.length > 0) {
        await tx.insert(conversationMessages).values(unclaimed);
      }
      await tx
        .update(conversations)
        .set({ updatedAt: sql`now()` })
        .where(eq(conversations.id, input.conversationId));
      return true;
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
        sources: readableSources(userId),
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
                sources: row.sources,
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

  async rename(
    conversationId: string,
    userId: string,
    title: string
  ): Promise<boolean> {
    // Never touches updatedAt: it means "last turn", so bumping it would reorder
    // the list and make findExtractable re-mine the conversation's memories.
    const renamed = await this.db
      .update(conversations)
      .set({ title })
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId)
        )
      )
      .returning({ id: conversations.id });
    return renamed.length > 0;
  }

  async deleteForUser(
    conversationId: string,
    userId: string
  ): Promise<boolean> {
    const deleted = await this.db
      .delete(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId)
        )
      )
      .returning({ id: conversations.id });
    return deleted.length > 0;
  }
}
