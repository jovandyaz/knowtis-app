import { UserId } from '@jovandyaz/auth/server';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PERMISSION } from '@knowtis/shared-types';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  notePermissions,
  notes,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { DrizzlePermissionRepository } from './drizzle-permission.repository';

const OWNER = '00000000-0000-4000-8000-0000000000f6';
const TARGET = '00000000-0000-4000-8000-0000000000f7';
const NOTE = '00000000-0000-4000-8000-0000000000f8';

describe.runIf(DB_AVAILABLE)('DrizzlePermissionRepository upsert', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzlePermissionRepository;
  const targetId = UserId.create(TARGET)._unsafeUnwrap();

  const rowsForTarget = () =>
    db
      .select()
      .from(notePermissions)
      .where(
        and(
          eq(notePermissions.noteId, NOTE),
          eq(notePermissions.userId, TARGET)
        )
      );

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
    repo = new DrizzlePermissionRepository(db);

    for (const id of [OWNER, TARGET]) {
      await db
        .insert(users)
        .values({
          id,
          email: `e-${id}@test.local`,
          name: 'U',
          isAnonymous: true,
        })
        .onConflictDoNothing();
    }
    await db.delete(notes).where(eq(notes.id, NOTE));
    await db.insert(notes).values({
      id: NOTE,
      ownerId: OWNER,
      title: 'shared',
      content: 'body',
    });
  });

  beforeEach(async () => {
    await db.delete(notePermissions).where(eq(notePermissions.noteId, NOTE));
  });

  afterAll(async () => {
    await db.delete(notes).where(eq(notes.id, NOTE));
    await db.delete(users).where(eq(users.id, TARGET));
    await db.delete(users).where(eq(users.id, OWNER));
    await moduleRef.close();
  });

  it('grants access on the first upsert', async () => {
    const result = await repo.upsertPermission({
      noteId: NOTE,
      userId: targetId,
      permission: PERMISSION.VIEWER,
    });

    expect(result.isOk()).toBe(true);
    const rows = await rowsForTarget();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.permission).toBe(PERMISSION.VIEWER);
  });

  it('raises the level in place instead of adding a second row', async () => {
    await repo.upsertPermission({
      noteId: NOTE,
      userId: targetId,
      permission: PERMISSION.VIEWER,
    });
    const result = await repo.upsertPermission({
      noteId: NOTE,
      userId: targetId,
      permission: PERMISSION.EDITOR,
    });

    expect(result.isOk()).toBe(true);
    const rows = await rowsForTarget();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.permission).toBe(PERMISSION.EDITOR);
  });

  it('leaves one row when the same share races with itself', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        repo.upsertPermission({
          noteId: NOTE,
          userId: targetId,
          permission: PERMISSION.EDITOR,
        })
      )
    );

    expect(results.every((r) => r.isOk())).toBe(true);
    expect(await rowsForTarget()).toHaveLength(1);
  });
});
