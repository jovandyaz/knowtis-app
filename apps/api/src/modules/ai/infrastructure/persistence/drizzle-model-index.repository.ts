import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, isNull, lt, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import { INDEX_PROVIDERS } from '@knowtis/ai-gateway';
import type { IndexedModel, IndexProvider } from '@knowtis/ai-gateway';

import {
  aiModelIndex,
  DATABASE_CONNECTION,
  type AiModelIndexRow,
  type Database,
  type NewAiModelIndexRow,
} from '../../../../database';
import type { ModelIndexRepository } from '../../domain/ports/model-index.repository';

const UPSERT_CHUNK_SIZE = 200;

function toIndexedModel(row: AiModelIndexRow): IndexedModel {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    family: row.family,
    releasedAt: row.releasedAt,
    status: row.status,
    toolCall: row.toolCall,
    structuredOutput: row.structuredOutput,
    inputModalities: row.inputModalities,
    outputModalities: row.outputModalities,
    inputCostPerToken: row.inputCostPerToken,
    outputCostPerToken: row.outputCostPerToken,
    cacheReadCostPerToken: row.cacheReadCostPerToken,
    cacheWriteCostPerToken: row.cacheWriteCostPerToken,
    maxInputTokens: row.maxInputTokens,
    maxOutputTokens: row.maxOutputTokens,
    reasoning: row.reasoning,
    canonical: row.canonical,
    openWeights: row.openWeights,
    retiresAt: row.retiresAt,
    source: row.source,
  };
}

function toRow(model: IndexedModel, seenAt: Date): NewAiModelIndexRow {
  return {
    ...model,
    inputModalities: [...model.inputModalities],
    outputModalities: [...model.outputModalities],
    lastSeenAt: seenAt,
    absentSince: null,
  };
}

/** Postgres exposes the row being inserted as `excluded` only inside ON CONFLICT DO UPDATE; this is invalid SQL anywhere else. */
function proposed(column: PgColumn) {
  return sql`excluded.${sql.identifier(column.name)}`;
}

@Injectable()
export class DrizzleModelIndexRepository implements ModelIndexRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async upsertMany(
    rows: readonly IndexedModel[],
    seenAt: Date
  ): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }
    await this.db.transaction(async (tx) => {
      for (let start = 0; start < rows.length; start += UPSERT_CHUNK_SIZE) {
        const chunk = rows
          .slice(start, start + UPSERT_CHUNK_SIZE)
          .map((model) => toRow(model, seenAt));
        await tx
          .insert(aiModelIndex)
          .values(chunk)
          .onConflictDoUpdate({
            target: aiModelIndex.id,
            set: {
              provider: proposed(aiModelIndex.provider),
              name: proposed(aiModelIndex.name),
              family: proposed(aiModelIndex.family),
              releasedAt: proposed(aiModelIndex.releasedAt),
              status: proposed(aiModelIndex.status),
              toolCall: proposed(aiModelIndex.toolCall),
              structuredOutput: proposed(aiModelIndex.structuredOutput),
              inputModalities: proposed(aiModelIndex.inputModalities),
              outputModalities: proposed(aiModelIndex.outputModalities),
              inputCostPerToken: proposed(aiModelIndex.inputCostPerToken),
              outputCostPerToken: proposed(aiModelIndex.outputCostPerToken),
              cacheReadCostPerToken: proposed(
                aiModelIndex.cacheReadCostPerToken
              ),
              cacheWriteCostPerToken: proposed(
                aiModelIndex.cacheWriteCostPerToken
              ),
              maxInputTokens: proposed(aiModelIndex.maxInputTokens),
              maxOutputTokens: proposed(aiModelIndex.maxOutputTokens),
              reasoning: proposed(aiModelIndex.reasoning),
              canonical: proposed(aiModelIndex.canonical),
              openWeights: proposed(aiModelIndex.openWeights),
              retiresAt: proposed(aiModelIndex.retiresAt),
              source: proposed(aiModelIndex.source),
              lastSeenAt: proposed(aiModelIndex.lastSeenAt),
              absentSince: null,
              updatedAt: sql`now()`,
            },
          });
      }
    });
    return rows.length;
  }

  async markAbsent(provider: IndexProvider, seenAt: Date): Promise<number> {
    const marked = await this.db
      .update(aiModelIndex)
      .set({ absentSince: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(aiModelIndex.provider, provider),
          lt(aiModelIndex.lastSeenAt, seenAt),
          isNull(aiModelIndex.absentSince)
        )
      )
      .returning({ id: aiModelIndex.id });
    return marked.length;
  }

  async listListed(): Promise<IndexedModel[]> {
    const rows = await this.db
      .select()
      .from(aiModelIndex)
      .where(isNull(aiModelIndex.absentSince));
    return rows.map(toIndexedModel);
  }

  async countListedByProvider(): Promise<
    Readonly<Record<IndexProvider, number>>
  > {
    const grouped = await this.db
      .select({ provider: aiModelIndex.provider, value: count() })
      .from(aiModelIndex)
      .where(isNull(aiModelIndex.absentSince))
      .groupBy(aiModelIndex.provider);
    const counts = Object.fromEntries(
      INDEX_PROVIDERS.map((provider) => [provider, 0])
    ) as Record<IndexProvider, number>;
    for (const { provider, value } of grouped) {
      counts[provider] = value;
    }
    return counts;
  }
}
