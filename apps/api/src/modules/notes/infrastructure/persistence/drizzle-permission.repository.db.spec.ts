import { UserId } from '@jovandyaz/auth/server';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  notes,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { DrizzlePermissionRepository } from './drizzle-permission.repository';

const OWNER = '00000000-0000-4000-8000-0000000000b5';
const NOTE = '00000000-0000-4000-8000-0000000000b6';

describe.runIf(DB_AVAILABLE)('DrizzlePermissionRepository soft-delete', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzlePermissionRepository;
  const ownerId = UserId.create(OWNER)._unsafeUnwrap();

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

    await db
      .insert(users)
      .values({
        id: OWNER,
        email: `e-${OWNER}@test.local`,
        name: 'O',
        isAnonymous: true,
      })
      .onConflictDoNothing();
    await db.delete(notes).where(eq(notes.id, NOTE));
    await db.insert(notes).values({
      id: NOTE,
      ownerId: OWNER,
      title: 'deleted',
      content: 'body',
      deletedAt: new Date(),
    });
  });

  afterAll(async () => {
    await db.delete(notes).where(eq(notes.id, NOTE));
    await db.delete(users).where(eq(users.id, OWNER));
    await moduleRef.close();
  });

  it('hasAccess is false for the owner of a soft-deleted note', async () => {
    expect(await repo.hasAccess(NOTE, ownerId)).toBe(false);
  });
});
