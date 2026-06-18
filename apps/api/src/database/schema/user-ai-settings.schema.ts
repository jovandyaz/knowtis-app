import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { MODEL_ID_MAX_LENGTH } from '@knowtis/shared-types';

import { users } from './users.schema';

export const userAiSettings = pgTable('user_ai_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  preferredModel: varchar('preferred_model', { length: MODEL_ID_MAX_LENGTH }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type UserAiSettingsRow = typeof userAiSettings.$inferSelect;
