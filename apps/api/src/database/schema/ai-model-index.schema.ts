import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  INDEX_PROVIDERS,
  INDEX_SOURCES,
  MODEL_STATUSES,
  type IndexedReasoning,
  type IndexProvider,
  type IndexSource,
  type ModelStatus,
} from '@knowtis/ai-gateway';
import {
  CATALOG_LABEL_MAX_LENGTH,
  MODEL_ID_MAX_LENGTH,
} from '@knowtis/shared-types';

import { sqlLiteralList } from './sql-literal-list';

const COST_PRECISION = 20;
const COST_SCALE = 15;
const ENUM_COLUMN_LENGTH = 16;
const FAMILY_MAX_LENGTH = 64;

function costColumn(name: string) {
  return numeric(name, {
    precision: COST_PRECISION,
    scale: COST_SCALE,
    mode: 'number',
  });
}

export const aiModelIndex = pgTable(
  'ai_model_index',
  {
    id: varchar('id', { length: MODEL_ID_MAX_LENGTH }).primaryKey(),
    provider: varchar('provider', { length: ENUM_COLUMN_LENGTH })
      .$type<IndexProvider>()
      .notNull(),
    name: varchar('name', { length: CATALOG_LABEL_MAX_LENGTH }).notNull(),
    family: varchar('family', { length: FAMILY_MAX_LENGTH }),
    releasedAt: date('released_at', { mode: 'string' }),
    status: varchar('status', { length: ENUM_COLUMN_LENGTH })
      .$type<ModelStatus>()
      .notNull(),
    toolCall: boolean('tool_call'),
    structuredOutput: boolean('structured_output'),
    inputModalities: text('input_modalities')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    outputModalities: text('output_modalities')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    inputCostPerToken: costColumn('input_cost_per_token'),
    outputCostPerToken: costColumn('output_cost_per_token'),
    cacheReadCostPerToken: costColumn('cache_read_cost_per_token'),
    cacheWriteCostPerToken: costColumn('cache_write_cost_per_token'),
    maxInputTokens: integer('max_input_tokens'),
    maxOutputTokens: integer('max_output_tokens'),
    reasoning: jsonb('reasoning').$type<IndexedReasoning | null>(),
    canonical: varchar('canonical', { length: MODEL_ID_MAX_LENGTH }).notNull(),
    openWeights: boolean('open_weights'),
    retiresAt: date('retires_at', { mode: 'string' }),
    source: varchar('source', { length: ENUM_COLUMN_LENGTH })
      .$type<IndexSource>()
      .notNull(),
    absentSince: timestamp('absent_since', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('ai_model_index_provider_idx').on(table.provider),
    index('ai_model_index_listed_idx')
      .on(table.absentSince)
      .where(sql`absent_since is null`),
    check(
      'ai_model_index_provider_check',
      sql`${table.provider} in (${sqlLiteralList(INDEX_PROVIDERS)})`
    ),
    check(
      'ai_model_index_status_check',
      sql`${table.status} in (${sqlLiteralList(MODEL_STATUSES)})`
    ),
    check(
      'ai_model_index_source_check',
      sql`${table.source} in (${sqlLiteralList(INDEX_SOURCES)})`
    ),
  ]
);

export type AiModelIndexRow = typeof aiModelIndex.$inferSelect;
export type NewAiModelIndexRow = typeof aiModelIndex.$inferInsert;
