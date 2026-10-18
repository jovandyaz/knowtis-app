import { Inject, Injectable } from '@nestjs/common';
import { and, cosineDistance, desc, eq, sql } from 'drizzle-orm';

import {
  conversations,
  DATABASE_CONNECTION,
  userMemories,
  type Database,
} from '../../../../database';
import {
  USER_AI_SETTINGS_REPOSITORY,
  type UserAiSettingsRepository,
} from '../../../ai/domain/ports/user-ai-settings.repository';
import type {
  MemoryMatch,
  MemoryRepository,
  StoredMemory,
  UpsertMemoryInput,
  UserMemoryRow,
  VersionedMemoryRow,
} from '../../domain/ports/memory.repository';

@Injectable()
export class DrizzleMemoryRepository implements MemoryRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database,
    @Inject(USER_AI_SETTINGS_REPOSITORY)
    private readonly settings: UserAiSettingsRepository
  ) {}

  async listForUser(
    userId: string,
    limit: number
  ): Promise<VersionedMemoryRow[]> {
    return this.db
      .select({
        id: userMemories.id,
        content: userMemories.content,
        version: sql<string>`${userMemories.updatedAt}::text`,
      })
      .from(userMemories)
      .where(eq(userMemories.userId, userId))
      .orderBy(desc(userMemories.updatedAt))
      .limit(limit);
  }

  async listWithSources(
    userId: string,
    limit: number
  ): Promise<StoredMemory[]> {
    const rows = await this.db
      .select({
        id: userMemories.id,
        content: userMemories.content,
        createdAt: userMemories.createdAt,
        updatedAt: userMemories.updatedAt,
        conversationId: conversations.id,
        title: conversations.title,
      })
      .from(userMemories)
      .leftJoin(
        conversations,
        and(
          eq(conversations.id, userMemories.sourceConversationId),
          eq(conversations.userId, userId)
        )
      )
      .where(eq(userMemories.userId, userId))
      .orderBy(desc(userMemories.updatedAt), desc(userMemories.id))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      source:
        row.conversationId === null
          ? null
          : { conversationId: row.conversationId, title: row.title },
    }));
  }

  async findForUser(userId: string, id: string): Promise<UserMemoryRow | null> {
    const [row] = await this.db
      .select({ id: userMemories.id, content: userMemories.content })
      .from(userMemories)
      .where(and(eq(userMemories.id, id), eq(userMemories.userId, userId)))
      .limit(1);
    return row ?? null;
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
  ): Promise<boolean> {
    const updated = await this.db
      .update(userMemories)
      .set({ content, embedding, updatedAt: sql`now()` })
      .where(and(eq(userMemories.id, id), eq(userMemories.userId, userId)))
      .returning({ id: userMemories.id });
    return updated.length > 0;
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

  async isEnabledFor(userId: string): Promise<boolean> {
    return (await this.settings.getSettings(userId)).memoryEnabled;
  }
}
