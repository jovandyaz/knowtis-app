import { UserId } from '@jovandyaz/auth/server';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
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
import { DrizzleNoteReadRepository } from './drizzle-note-read.repository';

const USER_ID = '00000000-0000-4000-8000-0000000000a3';

describe('DrizzleNoteReadRepository.findAccessibleNotesByLexicalRank', () => {
  let db: Database;
  let repo: DrizzleNoteReadRepository;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
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
        id: USER_ID,
        email: `a3-${USER_ID}@test.local`,
        name: 'A3',
        isAnonymous: true,
      })
      .onConflictDoNothing();
    await db
      .insert(notes)
      .values([
        {
          id: '00000000-0000-4000-8000-0000000000b1',
          ownerId: USER_ID,
          title: 'Project Aurora launch plan',
          content: 'aurora launch milestones and owners',
        },
        {
          id: '00000000-0000-4000-8000-0000000000b2',
          ownerId: USER_ID,
          title: 'Grocery list',
          content: 'milk eggs coffee',
        },
      ])
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, USER_ID));
  });

  it('ranks the lexically-relevant note first', async () => {
    const hits = await repo.findAccessibleNotesByLexicalRank(
      UserId.create(USER_ID)._unsafeUnwrap(),
      'aurora launch',
      10
    );
    expect(hits[0]?.title).toBe('Project Aurora launch plan');
  });
});
