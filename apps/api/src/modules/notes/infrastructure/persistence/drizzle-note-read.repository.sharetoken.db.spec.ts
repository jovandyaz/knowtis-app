import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GENERAL_ACCESS } from '@knowtis/shared-types';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  notes,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { DrizzleNoteReadRepository } from './drizzle-note-read.repository';

const OWNER = '00000000-0000-4000-8000-0000000000f4';
const PAUSED_NOTE = '00000000-0000-4000-8000-0000000000f5';
const PAUSED_TOKEN = 'sharetoken-paused-f5';

describe.runIf(DB_AVAILABLE)(
  'DrizzleNoteReadRepository share-token gating',
  () => {
    let moduleRef: TestingModule;
    let db: Database;
    let repo: DrizzleNoteReadRepository;

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
      repo = new DrizzleNoteReadRepository(db);

      await db
        .insert(users)
        .values({
          id: OWNER,
          email: `e-${OWNER}@test.local`,
          name: 'O',
          isAnonymous: true,
        })
        .onConflictDoNothing();
      await db.delete(notes).where(eq(notes.id, PAUSED_NOTE));
      await db.insert(notes).values({
        id: PAUSED_NOTE,
        ownerId: OWNER,
        title: 'sharing paused',
        content: 'body',
        shareToken: PAUSED_TOKEN,
        generalAccess: GENERAL_ACCESS.RESTRICTED,
      });
    });

    afterAll(async () => {
      await db.delete(notes).where(eq(notes.id, PAUSED_NOTE));
      await db.delete(users).where(eq(users.id, OWNER));
      await moduleRef.close();
    });

    it('does not resolve a retained token while the note is restricted', async () => {
      expect(await repo.findByShareToken(PAUSED_TOKEN)).toBeNull();
    });

    it('resolves the same token once sharing is re-enabled', async () => {
      await db
        .update(notes)
        .set({ generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK })
        .where(eq(notes.id, PAUSED_NOTE));

      expect(await repo.findByShareToken(PAUSED_TOKEN)).toMatchObject({
        id: PAUSED_NOTE,
      });

      await db
        .update(notes)
        .set({ generalAccess: GENERAL_ACCESS.RESTRICTED })
        .where(eq(notes.id, PAUSED_NOTE));
      expect(await repo.findByShareToken(PAUSED_TOKEN)).toBeNull();
    });
  }
);
