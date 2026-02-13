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

export const permissionEnum = pgEnum('permission_level', ['viewer', 'editor']);
export const generalAccessEnum = pgEnum('general_access', [
  'restricted',
  'anyone_with_link',
]);

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
    generalAccess: generalAccessEnum('general_access')
      .notNull()
      .default('restricted'),
    generalAccessPermission: permissionEnum('general_access_permission')
      .notNull()
      .default('viewer'),
    shareToken: text('share_token').unique(),
    editorsCanShare: boolean('editors_can_share').notNull().default(false),
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
    index('notes_general_access_idx').on(table.generalAccess),
    index('notes_share_token_idx').on(table.shareToken),
  ]
);

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;

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
