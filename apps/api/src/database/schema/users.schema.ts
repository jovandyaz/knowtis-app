import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { DEFAULT_LOCALE } from '@knowtis/shared-util';

export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    avatarUrl: text('avatar_url'),
    provider: text('provider').notNull().default('local'),
    providerId: text('provider_id'),
    passwordHash: text('password_hash'),
    locale: text('locale').default(DEFAULT_LOCALE),
    isAnonymous: boolean('is_anonymous').notNull().default(false),
    role: userRoleEnum('role').notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('users_email_idx').on(table.email),
    // Admin search matches with leading wildcards, which no btree index can serve.
    index('users_email_trgm_idx').using(
      'gin',
      sql`${table.email} gin_trgm_ops`
    ),
    uniqueIndex('users_provider_provider_id_idx').on(
      table.provider,
      table.providerId
    ),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
