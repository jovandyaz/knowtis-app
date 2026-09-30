import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { BYOK_PROVIDERS, MODEL_ID_MAX_LENGTH } from '@knowtis/shared-types';

import { sqlLiteralList } from './sql-literal-list';
import { users } from './users.schema';

export const userAiSettings = pgTable(
  'user_ai_settings',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    preferredModel: varchar('preferred_model', { length: MODEL_ID_MAX_LENGTH }),
    preferredIntent: varchar('preferred_intent', { length: 16 }),
    primaryProvider: varchar('primary_provider', { length: 20 }),
    ghostTextEnabled: boolean('ghost_text_enabled').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'user_ai_settings_primary_provider_check',
      sql`${table.primaryProvider} IS NULL OR ${table.primaryProvider} in (${sqlLiteralList(BYOK_PROVIDERS)})`
    ),
  ]
);

export type UserAiSettingsRow = typeof userAiSettings.$inferSelect;
