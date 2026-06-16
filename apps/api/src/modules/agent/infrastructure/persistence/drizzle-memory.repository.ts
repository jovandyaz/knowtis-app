import { Inject, Injectable } from '@nestjs/common';
import { and, cosineDistance, desc, eq, sql } from 'drizzle-orm';

import {
  DATABASE_CONNECTION,
  userMemories,
  type Database,
} from '../../../../database';
import type {
  MemoryMatch,
  MemoryReconcileBatch,
  MemoryRepository,
  UpsertMemoryInput,
  UserMemoryRow,
} from '../../domain/ports/memory.repository';

@Injectable()
export class DrizzleMemoryRepository implements MemoryRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async listForUser(userId: string, limit: number): Promise<UserMemoryRow[]> {
    return this.db
      .select({ id: userMemories.id, content: userMemories.content })
      .from(userMemories)
      .where(eq(userMemories.userId, userId))
      .orderBy(desc(userMemories.updatedAt))
      .limit(limit);
  }

  async searchForUser(
    userId: string,
    queryEmbedding: number[],
    k: number
  ): Promise<MemoryMatch[]> {
    const distance = cosineDistance(userMemories.embedding, queryEmbedding);
    const rows = await this.db
      .select({
        id: userMemories.id,
        content: userMemories.content,
        score: sql<number>`1 - (${distance})`,
      })
      .from(userMemories)
      .where(eq(userMemories.userId, userId))
      .orderBy(distance)
      .limit(k);
    return rows;
  }

  async insert(input: UpsertMemoryInput): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(userMemories)
      .values({
        userId: input.userId,
        content: input.content,
        embedding: input.embedding,
        ...(input.sourceConversationId
          ? { sourceConversationId: input.sourceConversationId }
          : {}),
      })
      .returning({ id: userMemories.id });
    return { id: row.id };
  }

  async update(
    userId: string,
    id: string,
    content: string,
    embedding: number[]
  ): Promise<void> {
    await this.db
      .update(userMemories)
      .set({ content, embedding, updatedAt: sql`now()` })
      .where(and(eq(userMemories.id, id), eq(userMemories.userId, userId)));
  }

  async applyReconcile(batch: MemoryReconcileBatch): Promise<void> {
    if (
      batch.deletes.length === 0 &&
      batch.inserts.length === 0 &&
      batch.updates.length === 0
    ) {
      return;
    }
    await this.db.transaction(async (tx) => {
      for (const id of batch.deletes) {
        await tx
          .delete(userMemories)
          .where(
            and(eq(userMemories.id, id), eq(userMemories.userId, batch.userId))
          );
      }
      if (batch.inserts.length > 0) {
        await tx.insert(userMemories).values(
          batch.inserts.map((x) => ({
            userId: batch.userId,
            content: x.content,
            embedding: x.embedding,
            ...(batch.sourceConversationId
              ? { sourceConversationId: batch.sourceConversationId }
              : {}),
          }))
        );
      }
      for (const u of batch.updates) {
        await tx
          .update(userMemories)
          .set({
            content: u.content,
            embedding: u.embedding,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(userMemories.id, u.id),
              eq(userMemories.userId, batch.userId)
            )
          );
      }
    });
  }

  async deleteForUser(userId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(userMemories)
      .where(and(eq(userMemories.id, id), eq(userMemories.userId, userId)))
      .returning({ id: userMemories.id });
    return deleted.length > 0;
  }

  async deleteAllForUser(userId: string): Promise<number> {
    const deleted = await this.db
      .delete(userMemories)
      .where(eq(userMemories.userId, userId))
      .returning({ id: userMemories.id });
    return deleted.length;
  }

  async countForUser(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(userMemories)
      .where(eq(userMemories.userId, userId));
    return row?.n ?? 0;
  }
}
