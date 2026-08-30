import { sql } from 'drizzle-orm';
import {
  bigserial,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  MESSAGE_STOP_REASON,
  MODEL_ID_MAX_LENGTH,
  type MessageStopReason,
} from '@knowtis/shared-types';

import type { PersistedParts } from '../../modules/agent/domain/agent-message';
import { notes } from './notes.schema';
import { users } from './users.schema';

export const conversationRoleEnum = pgEnum('conversation_role', [
  'user',
  'assistant',
  'tool',
]);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    noteId: uuid('note_id').references(() => notes.id, {
      onDelete: 'set null',
    }),
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    memoriesExtractedAt: timestamp('memories_extracted_at', {
      withTimezone: true,
    }),
    model: varchar('model', { length: MODEL_ID_MAX_LENGTH }),
  },
  (table) => [
    index('conversations_user_updated_idx').on(table.userId, table.updatedAt),
    index('conversations_updated_idx').on(table.updatedAt),
  ]
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export const conversationMessages = pgTable(
  'conversation_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seq: bigserial('seq', { mode: 'number' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: conversationRoleEnum('role').notNull(),
    content: text('content').notNull(),
    sources: jsonb('sources').$type<{ id: string; title: string }[]>(),
    parts: jsonb('parts').$type<PersistedParts>(),
    stopReason: text('stop_reason').$type<MessageStopReason>(),
    turnId: uuid('turn_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('conversation_messages_conversation_seq_idx').on(
      table.conversationId,
      table.seq
    ),
    check(
      'conversation_messages_stop_reason_check',
      sql`${table.stopReason} IS NULL OR ${table.stopReason} IN (${sql.raw(
        MESSAGE_STOP_REASON.map((reason) => `'${reason}'`).join(', ')
      )})`
    ),
  ]
);

export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type NewConversationMessage = typeof conversationMessages.$inferInsert;
