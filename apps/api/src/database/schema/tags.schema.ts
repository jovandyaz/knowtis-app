import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { notes } from './notes.schema';
import { users } from './users.schema';

const CASCADE_ON_DELETE = { onDelete: 'cascade' } as const;

export const TAGS_OWNER_PATH_INDEX = 'tags_owner_path_idx';

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, CASCADE_ON_DELETE),
    path: text('path').notNull(),
    color: text('color'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex(TAGS_OWNER_PATH_INDEX).on(table.ownerId, table.path)]
);

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

export const noteTags = pgTable(
  'note_tags',
  {
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, CASCADE_ON_DELETE),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, CASCADE_ON_DELETE),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.tagId] }),
    index('note_tags_tag_id_idx').on(table.tagId),
  ]
);

export type NoteTag = typeof noteTags.$inferSelect;
export type NewNoteTag = typeof noteTags.$inferInsert;
