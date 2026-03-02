import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  vector,
} from 'drizzle-orm/pg-core';

import { notes } from './notes.schema';

export const noteEmbeddings = pgTable(
  'note_embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    chunkContent: text('chunk_content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    model: varchar('model', { length: 50 })
      .notNull()
      .default('text-embedding-3-small'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_note_embeddings_note_id').on(table.noteId),
    index('idx_note_embeddings_vector').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
  ]
);

export type NoteEmbedding = typeof noteEmbeddings.$inferSelect;
export type NewNoteEmbedding = typeof noteEmbeddings.$inferInsert;
