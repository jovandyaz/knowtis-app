import { sql } from 'drizzle-orm';
import { check, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import {
  AI_MODEL_RESOLUTION_TEXT_MAX_LENGTH,
  MODEL_GATE_STATUSES,
  MODEL_ID_MAX_LENGTH,
  PLATFORM_SELECTOR_KEYS,
  type ModelGateStatus,
  type PlatformSelectorKey,
} from '@knowtis/shared-types';

import { sqlLiteralList } from './sql-literal-list';

const SELECTOR_KEY_MAX_LENGTH = 32;
const GATE_STATUS_MAX_LENGTH = 16;

export const aiModelResolutions = pgTable(
  'ai_model_resolutions',
  {
    selectorKey: varchar('selector_key', { length: SELECTOR_KEY_MAX_LENGTH })
      .$type<PlatformSelectorKey>()
      .primaryKey(),
    activeModelId: varchar('active_model_id', {
      length: MODEL_ID_MAX_LENGTH,
    }).notNull(),
    previousModelId: varchar('previous_model_id', {
      length: MODEL_ID_MAX_LENGTH,
    }),
    changedAt: timestamp('changed_at', { withTimezone: true }),
    releasedModelId: varchar('released_model_id', {
      length: MODEL_ID_MAX_LENGTH,
    }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    pendingModelId: varchar('pending_model_id', {
      length: MODEL_ID_MAX_LENGTH,
    }),
    gateStatus: varchar('gate_status', {
      length: GATE_STATUS_MAX_LENGTH,
    }).$type<ModelGateStatus>(),
    gateDetail: varchar('gate_detail', {
      length: AI_MODEL_RESOLUTION_TEXT_MAX_LENGTH,
    }),
    gateRunUrl: varchar('gate_run_url', {
      length: AI_MODEL_RESOLUTION_TEXT_MAX_LENGTH,
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'ai_model_resolutions_selector_key_check',
      sql`${table.selectorKey} in (${sqlLiteralList(PLATFORM_SELECTOR_KEYS)})`
    ),
    check(
      'ai_model_resolutions_gate_status_check',
      sql`${table.gateStatus} in (${sqlLiteralList(MODEL_GATE_STATUSES)})`
    ),
    check(
      'ai_model_resolutions_pending_gate_check',
      sql`(${table.pendingModelId} is null) = (${table.gateStatus} is null)`
    ),
  ]
);

export type AiModelResolutionRow = typeof aiModelResolutions.$inferSelect;
