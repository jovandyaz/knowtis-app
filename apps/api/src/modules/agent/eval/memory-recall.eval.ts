import 'reflect-metadata';

import * as path from 'node:path';

import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';
import { I18nModule } from 'nestjs-i18n';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE } from '@knowtis/shared-util';

import { validateEnv } from '../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  userMemories,
  users,
  type Database,
} from '../../../database';
import {
  EMBEDDING_PORT,
  type EmbeddingPort,
} from '../../ai/domain/ports/embedding.port';
import { AgentModule } from '../agent.module';
import { DrizzleMemoryRepository } from '../infrastructure/persistence/drizzle-memory.repository';

loadEnv({ path: ['.env.local', '.env'] });

const GATE = !!process.env['VOYAGE_API_KEY']?.trim();
const USER = '00000000-0000-4000-8000-0000000000e9';

describe.runIf(GATE)('memory recall retrieval quality', () => {
  let db: Database;
  let repo: DrizzleMemoryRepository;
  let embed: EmbeddingPort;
  let moduleClose: () => Promise<void>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['.env.local', '.env'],
        }),
        EventEmitterModule.forRoot(),
        I18nModule.forRoot({
          fallbackLanguage: DEFAULT_LOCALE,
          loaderOptions: {
            path: path.join(__dirname, '../../../i18n'),
            watch: false,
          },
        }),
        DatabaseModule,
        AgentModule,
      ],
    }).compile();
    await moduleRef.init();
    moduleClose = () => moduleRef.close();

    db = moduleRef.get<Database>(DATABASE_CONNECTION, { strict: false });
    embed = moduleRef.get<EmbeddingPort>(EMBEDDING_PORT, { strict: false });
    repo = new DrizzleMemoryRepository(db);

    await db
      .insert(users)
      .values({
        id: USER,
        email: `mem-eval-${USER}@test.local`,
        name: 'MemEval',
        isAnonymous: true,
      })
      .onConflictDoNothing();

    const facts = [
      'The user is vegan and avoids all animal products',
      'The user enjoys hiking on weekends',
    ];
    const { embeddings } = await embed.embedDocuments(facts);
    for (let i = 0; i < facts.length; i++) {
      await repo.insert({
        userId: USER,
        content: facts[i],
        embedding: embeddings[i],
      });
    }
  }, 120_000);

  afterAll(async () => {
    if (db) {
      await db.delete(userMemories).where(eq(userMemories.userId, USER));
      await db.delete(users).where(eq(users.id, USER));
    }
    if (moduleClose) {
      await moduleClose();
    }
  });

  it('ranks the vegan fact first for a dietary query', async () => {
    const queryEmbedding = await embed.embedQuery(
      'what should I cook for dinner?'
    );
    const hits = await repo.searchForUser(USER, queryEmbedding, 6);

    expect(hits.length).toBeGreaterThanOrEqual(1);
    const veganIndex = hits.findIndex((h) =>
      h.content.includes('vegan and avoids all animal products')
    );
    expect(veganIndex).toBeGreaterThanOrEqual(0);
    expect(veganIndex).toBe(0);
    expect(hits[0].score).toBeGreaterThan(0.2);
  }, 60_000);
});

if (!GATE) {
  describe('memory recall retrieval quality', () => {
    it.skip('requires VOYAGE_API_KEY', () => undefined);
  });
}
