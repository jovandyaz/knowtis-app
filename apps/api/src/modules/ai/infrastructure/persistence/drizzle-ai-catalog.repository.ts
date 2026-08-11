import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import { PROMOTED_STATUS } from '@knowtis/shared-types';
import type {
  CatalogAlertKind,
  CatalogModelStatus,
} from '@knowtis/shared-types';

import {
  aiCatalogAlerts,
  aiCatalogModels,
  DATABASE_CONNECTION,
  type AiCatalogAlertRow,
  type AiCatalogModelRow,
  type Database,
} from '../../../../database';
import type { CatalogAlert } from '../../domain/model-catalog/catalog-alert';
import type { CatalogModel } from '../../domain/model-catalog/catalog-model';
import type {
  AiCatalogRepository,
  CandidateUpsert,
  CatalogStatusChange,
} from '../../domain/ports/ai-catalog.repository';

const UPSTREAM_OWNED_COPY_STATUS =
  'candidate' as const satisfies CatalogModelStatus;

function toCatalogModel(row: AiCatalogModelRow): CatalogModel {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    status: row.status,
    tier: row.tier,
    inputCostPerToken: row.inputCostPerToken,
    outputCostPerToken: row.outputCostPerToken,
    maxInputTokens: row.maxInputTokens,
    maxOutputTokens: row.maxOutputTokens,
    intelligenceIndex: row.intelligenceIndex,
    upstreamCreatedAt: row.upstreamCreatedAt,
    upstreamExpirationDate: row.upstreamExpirationDate,
    lastSeenAt: row.lastSeenAt,
    promotedBy: row.promotedBy,
    promotedAt: row.promotedAt,
  };
}

function toCatalogAlert(row: AiCatalogAlertRow): CatalogAlert {
  return {
    id: row.id,
    modelId: row.modelId,
    kind: row.kind,
    detail: row.detail,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  };
}

/** Postgres exposes the row being inserted as `excluded` only inside ON CONFLICT DO UPDATE; this is invalid SQL anywhere else. */
function proposed(column: PgColumn) {
  return sql`excluded.${sql.identifier(column.name)}`;
}

function keepCuratedCopy(column: PgColumn) {
  return sql`case when ${aiCatalogModels.status} = ${UPSTREAM_OWNED_COPY_STATUS} then ${proposed(column)} else ${column} end`;
}

/** SET expressions read the pre-update row, so re-promoting keeps the actor and timestamp of the promotion that actually happened. */
function keepFirstPromotion(column: PgColumn, fresh: SQL) {
  return sql`case when ${aiCatalogModels.status} = ${PROMOTED_STATUS} then ${column} else ${fresh} end`;
}

@Injectable()
export class DrizzleAiCatalogRepository implements AiCatalogRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async listByStatus(status: CatalogModelStatus): Promise<CatalogModel[]> {
    const rows = await this.db
      .select()
      .from(aiCatalogModels)
      .where(eq(aiCatalogModels.status, status))
      .orderBy(asc(aiCatalogModels.id));
    return rows.map(toCatalogModel);
  }

  async upsertCandidate(model: CandidateUpsert): Promise<void> {
    await this.db
      .insert(aiCatalogModels)
      .values(model)
      .onConflictDoUpdate({
        target: aiCatalogModels.id,
        set: {
          label: keepCuratedCopy(aiCatalogModels.label),
          description: keepCuratedCopy(aiCatalogModels.description),
          inputCostPerToken: proposed(aiCatalogModels.inputCostPerToken),
          outputCostPerToken: proposed(aiCatalogModels.outputCostPerToken),
          maxInputTokens: proposed(aiCatalogModels.maxInputTokens),
          maxOutputTokens: proposed(aiCatalogModels.maxOutputTokens),
          intelligenceIndex: proposed(aiCatalogModels.intelligenceIndex),
          upstreamCreatedAt: proposed(aiCatalogModels.upstreamCreatedAt),
          upstreamExpirationDate: proposed(
            aiCatalogModels.upstreamExpirationDate
          ),
          lastSeenAt: sql`now()`,
        },
      })
      .returning({ id: aiCatalogModels.id });
  }

  async setStatus(
    id: string,
    change: CatalogStatusChange,
    actorId: string
  ): Promise<CatalogModel | null> {
    const promotion =
      change.status === PROMOTED_STATUS
        ? {
            tier: change.tier,
            promotedBy: keepFirstPromotion(
              aiCatalogModels.promotedBy,
              sql`${actorId}`
            ),
            promotedAt: keepFirstPromotion(
              aiCatalogModels.promotedAt,
              sql`now()`
            ),
          }
        : {};
    const [row] = await this.db
      .update(aiCatalogModels)
      .set({ status: change.status, updatedAt: sql`now()`, ...promotion })
      .where(eq(aiCatalogModels.id, id))
      .returning();
    return row ? toCatalogModel(row) : null;
  }

  async updateCopy(
    id: string,
    patch: { label?: string; description?: string }
  ): Promise<CatalogModel | null> {
    const [row] = await this.db
      .update(aiCatalogModels)
      .set({
        ...(patch.label !== undefined && { label: patch.label }),
        ...(patch.description !== undefined && {
          description: patch.description,
        }),
        updatedAt: sql`now()`,
      })
      .where(eq(aiCatalogModels.id, id))
      .returning();
    return row ? toCatalogModel(row) : null;
  }

  async listAlerts(unresolvedOnly: boolean): Promise<CatalogAlert[]> {
    const rows = await this.db
      .select()
      .from(aiCatalogAlerts)
      .where(unresolvedOnly ? isNull(aiCatalogAlerts.resolvedAt) : undefined)
      .orderBy(desc(aiCatalogAlerts.createdAt), desc(aiCatalogAlerts.id));
    return rows.map(toCatalogAlert);
  }

  async createAlert(
    modelId: string,
    kind: CatalogAlertKind,
    detail: string
  ): Promise<void> {
    await this.db
      .insert(aiCatalogAlerts)
      .values({ modelId, kind, detail })
      .onConflictDoNothing({
        target: [aiCatalogAlerts.modelId, aiCatalogAlerts.kind],
        where: isNull(aiCatalogAlerts.resolvedAt),
      })
      .returning({ id: aiCatalogAlerts.id });
  }

  async resolveAlert(id: number): Promise<boolean> {
    const rows = await this.db
      .update(aiCatalogAlerts)
      .set({ resolvedAt: sql`now()` })
      .where(
        and(eq(aiCatalogAlerts.id, id), isNull(aiCatalogAlerts.resolvedAt))
      )
      .returning({ id: aiCatalogAlerts.id });
    return rows.length > 0;
  }
}
