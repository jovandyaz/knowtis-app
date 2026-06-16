import {
  bigserial,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { notes } from './notes.schema';
import { users } from './users.schema';

export const conversationRoleEnum = pgEnum('conversation_role', [
  'user',
  'assistant',
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('conversation_messages_conversation_seq_idx').on(
      table.conversationId,
      table.seq
    ),
  ]
);

export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type NewConversationMessage = typeof conversationMessages.$inferInsert;
