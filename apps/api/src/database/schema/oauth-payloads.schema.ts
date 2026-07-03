import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const oauthPayloads = pgTable(
  'oauth_payloads',
  {
    model: text('model').notNull(),
    id: text('id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    grantId: text('grant_id'),
    userCode: text('user_code'),
    uid: text('uid'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.model, table.id] }),
    index('idx_oauth_payloads_grant').on(table.grantId),
    index('idx_oauth_payloads_uid').on(table.uid),
    index('idx_oauth_payloads_user_code').on(table.userCode),
    index('idx_oauth_payloads_expires').on(table.expiresAt),
    index('idx_oauth_payloads_grant_account_client')
      .on(
        sql`(${table.payload} ->> 'accountId')`,
        sql`(${table.payload} ->> 'clientId')`
      )
      .where(sql`${table.model} = 'Grant'`),
  ]
);

export type OauthPayloadRow = typeof oauthPayloads.$inferSelect;
export type NewOauthPayloadRow = typeof oauthPayloads.$inferInsert;
