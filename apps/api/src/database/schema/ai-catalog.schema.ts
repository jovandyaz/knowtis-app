import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  CATALOG_ALERT_KINDS,
  CATALOG_MODEL_STATUSES,
  MODEL_ID_MAX_LENGTH,
  MODEL_TIERS,
  type CatalogAlertKind,
  type CatalogModelStatus,
  type ModelTier,
} from '@knowtis/shared-types';

import { users } from './users.schema';

const DEFAULT_CATALOG_MODEL_STATUS: CatalogModelStatus = 'candidate';
const DEFAULT_CATALOG_MODEL_TIER: ModelTier = 'open';

/** sql.raw does not escape: only compile-time literal arrays, never runtime-derived strings. */
function sqlLiteralList(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

export const aiCatalogModels = pgTable(
  'ai_catalog_models',
  {
    id: varchar('id', { length: MODEL_ID_MAX_LENGTH }).primaryKey(),
    label: varchar('label', { length: 100 }).notNull(),
    description: varchar('description', { length: 500 }).notNull().default(''),
    tier: varchar('tier', { length: 16 })
      .$type<ModelTier>()
      .notNull()
      .default(DEFAULT_CATALOG_MODEL_TIER),
    status: varchar('status', { length: 16 })
      .$type<CatalogModelStatus>()
      .notNull()
      .default(DEFAULT_CATALOG_MODEL_STATUS),
    inputCostPerToken: numeric('input_cost_per_token', {
      precision: 12,
      scale: 10,
      mode: 'number',
    }).notNull(),
    outputCostPerToken: numeric('output_cost_per_token', {
      precision: 12,
      scale: 10,
      mode: 'number',
    }).notNull(),
    maxInputTokens: integer('max_input_tokens').notNull(),
    maxOutputTokens: integer('max_output_tokens'),
    intelligenceIndex: numeric('intelligence_index', {
      precision: 4,
      scale: 1,
      mode: 'number',
    }),
    upstreamCreatedAt: timestamp('upstream_created_at', { withTimezone: true }),
    upstreamExpirationDate: timestamp('upstream_expiration_date', {
      withTimezone: true,
    }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    promotedBy: uuid('promoted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    promotedAt: timestamp('promoted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('ai_catalog_models_status_idx').on(table.status),
    check(
      'ai_catalog_models_status_check',
      sql`${table.status} in (${sqlLiteralList(CATALOG_MODEL_STATUSES)})`
    ),
    check(
      'ai_catalog_models_tier_check',
      sql`${table.tier} in (${sqlLiteralList(MODEL_TIERS)})`
    ),
  ]
);

export const aiCatalogAlerts = pgTable(
  'ai_catalog_alerts',
  {
    id: serial('id').primaryKey(),
    modelId: varchar('model_id', { length: MODEL_ID_MAX_LENGTH })
      .notNull()
      .references(() => aiCatalogModels.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 24 }).$type<CatalogAlertKind>().notNull(),
    detail: varchar('detail', { length: 500 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    index('ai_catalog_alerts_resolved_idx').on(table.resolvedAt),
    uniqueIndex('ai_catalog_alerts_open_uniq')
      .on(table.modelId, table.kind)
      .where(sql`resolved_at is null`),
    check(
      'ai_catalog_alerts_kind_check',
      sql`${table.kind} in (${sqlLiteralList(CATALOG_ALERT_KINDS)})`
    ),
  ]
);

export type AiCatalogModelRow = typeof aiCatalogModels.$inferSelect;
export type NewAiCatalogModelRow = typeof aiCatalogModels.$inferInsert;
export type AiCatalogAlertRow = typeof aiCatalogAlerts.$inferSelect;
