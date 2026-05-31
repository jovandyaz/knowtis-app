import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { notes } from './notes.schema';
import { users } from './users.schema';

export const noteImages = pgTable(
  'note_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pathname: text('pathname').notNull(),
    url: text('url').notNull(),
    size: integer('size').notNull(),
    mimeType: text('mime_type').notNull(),
    width: integer('width'),
    height: integer('height'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('note_images_note_id_idx').on(table.noteId)]
);

export type NoteImage = typeof noteImages.$inferSelect;
export type NewNoteImage = typeof noteImages.$inferInsert;
