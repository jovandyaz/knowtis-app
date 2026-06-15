import { pgTable, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core';

import { notes } from './notes.schema';

export const noteEmbeddings = pgTable('note_embeddings', {
  noteId: uuid('note_id')
    .primaryKey()
    .references(() => notes.id, { onDelete: 'cascade' }),
  embedding: vector('embedding', { dimensions: 1024 }).notNull(),
  model: text('model').notNull(),
  inputHash: text('input_hash').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type NoteEmbedding = typeof noteEmbeddings.$inferSelect;
export type NewNoteEmbedding = typeof noteEmbeddings.$inferInsert;
