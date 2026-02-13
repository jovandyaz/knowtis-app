import {
  boolean,
  customType,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './users.schema';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    yjsState: bytea('yjs_state'),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    isPublic: boolean('is_public').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('notes_owner_id_idx').on(table.ownerId),
    index('notes_updated_at_idx').on(table.updatedAt),
    index('notes_is_public_idx').on(table.isPublic),
  ]
);

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;

export const permissionEnum = pgEnum('permission_level', ['viewer', 'editor']);

export const notePermissions = pgTable(
  'note_permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permission: permissionEnum('permission').notNull().default('viewer'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('permissions_note_id_idx').on(table.noteId),
    index('permissions_user_id_idx').on(table.userId),
    index('permissions_note_user_idx').on(table.noteId, table.userId),
  ]
);

export type NotePermission = typeof notePermissions.$inferSelect;
export type NewNotePermission = typeof notePermissions.$inferInsert;

export const noteShareLinks = pgTable(
  'note_share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    permission: permissionEnum('permission').notNull().default('viewer'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('share_links_note_id_idx').on(table.noteId),
    index('share_links_token_idx').on(table.token),
  ]
);

export type NoteShareLink = typeof noteShareLinks.$inferSelect;
export type NewNoteShareLink = typeof noteShareLinks.$inferInsert;
