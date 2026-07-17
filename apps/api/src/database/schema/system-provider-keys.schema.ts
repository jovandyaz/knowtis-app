import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from './users.schema';

export const systemProviderKeys = pgTable(
  'system_provider_keys',
  {
    provider: varchar('provider', { length: 20 }).primaryKey(),
    enabled: boolean('enabled').notNull().default(true),
    ciphertext: text('ciphertext'),
    iv: text('iv'),
    authTag: text('auth_tag'),
    keyPrefix: varchar('key_prefix', { length: 12 }),
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'system_provider_keys_provider_check',
      sql`${table.provider} in ('anthropic', 'openai', 'google', 'openrouter')`
    ),
    // A row may carry no key (enablement only, env supplies the key); when it
    // does, the AES-GCM parts and the prefix shown to admins travel together.
    check(
      'system_provider_keys_secret_complete',
      sql`(${table.ciphertext} is null and ${table.iv} is null and ${table.authTag} is null and ${table.keyPrefix} is null)
          or (${table.ciphertext} is not null and ${table.iv} is not null and ${table.authTag} is not null and ${table.keyPrefix} is not null)`
    ),
  ]
);

export type SystemProviderKeyRow = typeof systemProviderKeys.$inferSelect;
