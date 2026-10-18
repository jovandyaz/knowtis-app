import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  conversations,
  DATABASE_CONNECTION,
  DatabaseModule,
  userAiSettings,
  userMemories,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { DrizzleUserAiSettingsRepository } from '../../../ai/infrastructure/persistence/drizzle-user-ai-settings.repository';
import { DrizzleMemoryRepository } from './drizzle-memory.repository';

const U1 = '00000000-0000-4000-8000-0000000000ea';
const U2 = '00000000-0000-4000-8000-0000000000eb';
const vec = (seed: number) =>
  new Array(1024).fill(0).map((_, i) => (i === seed ? 1 : 0));

describe.runIf(DB_AVAILABLE)('DrizzleMemoryRepository', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleMemoryRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['.env.local', '.env'],
        }),
        DatabaseModule,
      ],
    }).compile();
    db = moduleRef.get<Database>(DATABASE_CONNECTION);
    repo = new DrizzleMemoryRepository(
      db,
      new DrizzleUserAiSettingsRepository(db)
    );
    await db
      .insert(users)
      .values([
        { id: U1, email: `e-${U1}@t.local`, name: 'A', isAnonymous: false },
        { id: U2, email: `e-${U2}@t.local`, name: 'B', isAnonymous: false },
      ])
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, U1));
    await db.delete(users).where(eq(users.id, U2));
    await moduleRef.close();
  });

  it('scopes search to the owner and never returns another user memory', async () => {
    await repo.insert({
      userId: U1,
      content: 'U1 likes React',
      embedding: vec(1),
    });
    await repo.insert({
      userId: U2,
      content: 'U2 likes Vue',
      embedding: vec(2),
    });

    const mine = await repo.searchForUser(U1, vec(2), 5);
    expect(mine.every((m) => m.content !== 'U2 likes Vue')).toBe(true);
    expect(mine.map((m) => m.content)).toContain('U1 likes React');
  });

  it('deleteForUser only deletes the caller own memory', async () => {
    const { id } = await repo.insert({
      userId: U2,
      content: 'U2 secret',
      embedding: vec(3),
    });
    expect(await repo.deleteForUser(U1, id)).toBe(false);
    expect(await repo.deleteForUser(U2, id)).toBe(true);
  });

  it('update only mutates the caller own row', async () => {
    const { id } = await repo.insert({
      userId: U1,
      content: 'before',
      embedding: vec(4),
    });
    expect(await repo.update(U2, id, 'hacked', vec(5))).toBe(false);
    const afterWrong = await repo.listForUser(U1, 50);
    expect(afterWrong.find((m) => m.id === id)?.content).toBe('before');
    expect(await repo.update(U1, id, 'after', vec(6))).toBe(true);
    const afterRight = await repo.listForUser(U1, 50);
    expect(afterRight.find((m) => m.id === id)?.content).toBe('after');
  });

  it('countForUser and deleteAllForUser are scoped to the user', async () => {
    await repo.deleteAllForUser(U1);
    await repo.deleteAllForUser(U2);
    await repo.insert({ userId: U1, content: 'a', embedding: vec(7) });
    await repo.insert({ userId: U1, content: 'b', embedding: vec(8) });
    await repo.insert({ userId: U2, content: 'c', embedding: vec(9) });
    expect(await repo.countForUser(U1)).toBe(2);
    expect(await repo.countForUser(U2)).toBe(1);
    const removed = await repo.deleteAllForUser(U1);
    expect(removed).toBe(2);
    expect(await repo.countForUser(U1)).toBe(0);
    expect(await repo.countForUser(U2)).toBe(1); // U2 untouched
  });

  it('lists memories newest-updated first with the conversation that last wrote them, scoped to the owner', async () => {
    await repo.deleteAllForUser(U1);
    await repo.deleteAllForUser(U2);
    const [source] = await db
      .insert(conversations)
      .values({ userId: U1, title: 'Trip planning' })
      .returning({ id: conversations.id });
    const [foreignSource] = await db
      .insert(conversations)
      .values({ userId: U2, title: 'Not yours' })
      .returning({ id: conversations.id });
    const sourced = await repo.insert({
      userId: U1,
      content: 'Prefers window seats',
      embedding: vec(10),
      sourceConversationId: source.id,
    });
    const crossed = await repo.insert({
      userId: U1,
      content: 'Unlinked fact',
      embedding: vec(11),
      sourceConversationId: foreignSource.id,
    });
    await repo.insert({ userId: U2, content: 'u2 fact', embedding: vec(12) });
    await db
      .update(userMemories)
      .set({
        createdAt: sql`now() - interval '1 hour'`,
        updatedAt: sql`now() - interval '1 hour'`,
      })
      .where(eq(userMemories.userId, U1));
    await repo.update(U1, sourced.id, 'Prefers aisle seats', vec(13));

    const listed = await repo.listWithSources(U1, 50);

    expect(
      listed.map(({ id, content, source: from }) => ({
        id,
        content,
        source: from,
      }))
    ).toEqual([
      {
        id: sourced.id,
        content: 'Prefers aisle seats',
        source: { conversationId: source.id, title: 'Trip planning' },
      },
      { id: crossed.id, content: 'Unlinked fact', source: null },
    ]);
    expect(listed[0]?.updatedAt.getTime()).toBeGreaterThan(
      listed[0]?.createdAt.getTime() ?? Infinity
    );
  });

  it('finds a memory only for its owner', async () => {
    const { id } = await repo.insert({
      userId: U1,
      content: 'Owns a bike',
      embedding: vec(14),
    });

    expect(await repo.findForUser(U1, id)).toEqual({
      id,
      content: 'Owns a bike',
    });
    expect(await repo.findForUser(U2, id)).toBeNull();
  });

  it('reads memory as on until the user pauses it', async () => {
    await db.delete(userAiSettings).where(eq(userAiSettings.userId, U1));
    expect(await repo.isEnabledFor(U1)).toBe(true);

    await new DrizzleUserAiSettingsRepository(db).patchSettings(U1, {
      memoryEnabled: false,
    });

    expect(await repo.isEnabledFor(U1)).toBe(false);
    expect(await repo.isEnabledFor(U2)).toBe(true);
    await db.delete(userAiSettings).where(eq(userAiSettings.userId, U1));
  });
});
