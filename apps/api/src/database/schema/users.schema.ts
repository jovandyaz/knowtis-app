import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { DEFAULT_LOCALE } from '@knowtis/shared-i18n';

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
    uniqueIndex('users_provider_provider_id_idx').on(
      table.provider,
      table.providerId
    ),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
