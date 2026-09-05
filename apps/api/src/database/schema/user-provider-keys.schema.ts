import { sql } from 'drizzle-orm';
import {
  check,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { BYOK_PROVIDERS } from '@knowtis/shared-types';

import { sqlLiteralList } from './sql-literal-list';
import { users } from './users.schema';

export const userProviderKeys = pgTable(
  'user_provider_keys',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 20 }).notNull(),
    ciphertext: text('ciphertext').notNull(),
    iv: text('iv').notNull(),
    authTag: text('auth_tag').notNull(),
    keyPrefix: varchar('key_prefix', { length: 12 }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.provider] }),
    check(
      'user_provider_keys_provider_check',
      sql`${table.provider} in (${sqlLiteralList(BYOK_PROVIDERS)})`
    ),
  ]
);

export type UserProviderKeyRow = typeof userProviderKeys.$inferSelect;
