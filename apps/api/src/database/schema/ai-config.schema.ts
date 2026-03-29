import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export const aiConfig = pgTable('ai_config', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: varchar('value', { length: 500 }).notNull(),
  description: varchar('description', { length: 500 }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
