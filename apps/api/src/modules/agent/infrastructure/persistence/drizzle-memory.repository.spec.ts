import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  users,
  type Database,
} from '../../../../database';
import { DrizzleMemoryRepository } from './drizzle-memory.repository';

loadEnv({ path: ['.env.local', '.env'] });
const DB_AVAILABLE = !!process.env['DATABASE_URL']?.trim();
const U1 = '00000000-0000-4000-8000-0000000000ea';
const U2 = '00000000-0000-4000-8000-0000000000eb';
const vec = (seed: number) =>
  new Array(1024).fill(0).map((_, i) => (i === seed ? 1 : 0));

describe.runIf(DB_AVAILABLE)('DrizzleMemoryRepository', () => {
  let db: Database;
  let repo: DrizzleMemoryRepository;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['.env.local', '.env'],
        }),
        DatabaseModule,
      ],
    }).compile();
    db = mod.get<Database>(DATABASE_CONNECTION);
    repo = new DrizzleMemoryRepository(db);
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
    await repo.update(U2, id, 'hacked', vec(5)); // wrong user → no-op
    const afterWrong = await repo.listForUser(U1, 50);
    expect(afterWrong.find((m) => m.id === id)?.content).toBe('before');
    await repo.update(U1, id, 'after', vec(6)); // correct user → updates
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

  it('applyReconcile applies the owner batch and never touches another user', async () => {
    await repo.deleteAllForUser(U1);
    await repo.deleteAllForUser(U2);
    const stale = await repo.insert({
      userId: U1,
      content: 'stale',
      embedding: vec(10),
    });
    const target = await repo.insert({
      userId: U1,
      content: 'before',
      embedding: vec(11),
    });
    const foreign = await repo.insert({
      userId: U2,
      content: 'u2 keep',
      embedding: vec(14),
    });
    await repo.applyReconcile({
      userId: U1,
      deletes: [stale.id, foreign.id],
      inserts: [{ content: 'fresh', embedding: vec(12) }],
      updates: [
        { id: target.id, content: 'after', embedding: vec(13) },
        { id: foreign.id, content: 'hacked', embedding: vec(15) },
      ],
    });
    const mine = await repo.listForUser(U1, 50);
    expect(mine.map((m) => m.content).sort()).toEqual(['after', 'fresh']);
    const theirs = await repo.listForUser(U2, 50);
    expect(theirs.map((m) => m.content)).toEqual(['u2 keep']);
  });
});
