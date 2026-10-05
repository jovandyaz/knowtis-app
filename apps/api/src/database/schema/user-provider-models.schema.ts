import {
  foreignKey,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { userProviderKeys } from './user-provider-keys.schema';

const PROVIDER_MAX_LENGTH = 20;
const KEY_FINGERPRINT_LENGTH = 64;

export const userProviderModels = pgTable(
  'user_provider_models',
  {
    userId: uuid('user_id').notNull(),
    provider: varchar('provider', { length: PROVIDER_MAX_LENGTH }).notNull(),
    keyFingerprint: varchar('key_fingerprint', {
      length: KEY_FINGERPRINT_LENGTH,
    }).notNull(),
    modelIds: text('model_ids').array().notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.provider] }),
    foreignKey({
      name: 'user_provider_models_key_fk',
      columns: [table.userId, table.provider],
      foreignColumns: [userProviderKeys.userId, userProviderKeys.provider],
    }).onDelete('cascade'),
  ]
);
