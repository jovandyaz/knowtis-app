import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

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
import type {
  AiCatalogRepository,
  CandidateUpsert,
} from '../../domain/ports/ai-catalog.repository';

const PROMOTED_STATUS: CatalogModelStatus = 'promoted';
const UPSTREAM_OWNED_COPY_STATUS: CatalogModelStatus = 'candidate';

/** Postgres exposes the row being inserted as `excluded` only inside ON CONFLICT DO UPDATE; this is invalid SQL anywhere else. */
function proposed(column: PgColumn) {
  return sql`excluded.${sql.identifier(column.name)}`;
}

function keepCuratedCopy(column: PgColumn) {
  return sql`case when ${aiCatalogModels.status} = ${UPSTREAM_OWNED_COPY_STATUS} then ${proposed(column)} else ${column} end`;
}

@Injectable()
export class DrizzleAiCatalogRepository implements AiCatalogRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async listByStatus(status: CatalogModelStatus): Promise<AiCatalogModelRow[]> {
    return this.db
      .select()
      .from(aiCatalogModels)
      .where(eq(aiCatalogModels.status, status))
      .orderBy(asc(aiCatalogModels.id));
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
    status: CatalogModelStatus,
    actorId: string
  ): Promise<AiCatalogModelRow | null> {
    const promotion =
      status === PROMOTED_STATUS
        ? { promotedBy: actorId, promotedAt: sql`now()` }
        : {};
    const rows = await this.db
      .update(aiCatalogModels)
      .set({ status, updatedAt: sql`now()`, ...promotion })
      .where(eq(aiCatalogModels.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async updateCopy(
    id: string,
    patch: { label?: string; description?: string }
  ): Promise<AiCatalogModelRow | null> {
    const rows = await this.db
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
    return rows[0] ?? null;
  }

  async listAlerts(unresolvedOnly: boolean): Promise<AiCatalogAlertRow[]> {
    return this.db
      .select()
      .from(aiCatalogAlerts)
      .where(unresolvedOnly ? isNull(aiCatalogAlerts.resolvedAt) : undefined)
      .orderBy(desc(aiCatalogAlerts.createdAt), desc(aiCatalogAlerts.id));
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

  async resolveAlert(id: number): Promise<void> {
    await this.db
      .update(aiCatalogAlerts)
      .set({ resolvedAt: sql`now()` })
      .where(
        and(eq(aiCatalogAlerts.id, id), isNull(aiCatalogAlerts.resolvedAt))
      )
      .returning({ id: aiCatalogAlerts.id });
  }
}
