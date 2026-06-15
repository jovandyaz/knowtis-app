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
  noteEmbeddings,
  notes,
  users,
  type Database,
} from '../../../database';
import {
  EMBEDDING_PORT,
  type EmbeddingPort,
} from '../../ai/domain/ports/embedding.port';
import { AgentModule } from '../agent.module';
import { HybridRetrievalAdapter } from '../infrastructure/retrieval/hybrid-retrieval.adapter';

loadEnv({ path: ['.env.local', '.env'] });

const GATE = !!process.env['VOYAGE_API_KEY']?.trim();
const USER = '00000000-0000-4000-8000-0000000000f1';
const ES_NOTE = '00000000-0000-4000-8000-0000000000f2';
const EN_NOTE = '00000000-0000-4000-8000-0000000000f3';
const MODEL = process.env['AI_EMBEDDING_MODEL'] ?? 'voyage-4';

const CASES = [
  {
    name: 'cross-lingual EN→ES',
    query: 'quarterly budget meeting',
    expected: ES_NOTE,
  },
  {
    name: 'paraphrase',
    query: 'notes about the product launch timeline',
    expected: EN_NOTE,
  },
];

describe.runIf(GATE)('hybrid retrieval quality', () => {
  let db: Database;
  let adapter: HybridRetrievalAdapter;
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
    adapter = moduleRef.get(HybridRetrievalAdapter, { strict: false });
    const embed = moduleRef.get<EmbeddingPort>(EMBEDDING_PORT, {
      strict: false,
    });

    await db
      .insert(users)
      .values({
        id: USER,
        email: `q-${USER}@test.local`,
        name: 'Q',
        isAnonymous: true,
      })
      .onConflictDoNothing();
    const seed = [
      {
        id: ES_NOTE,
        title: 'Reunión de presupuesto trimestral',
        content:
          'Acordamos el presupuesto del trimestre y los responsables de cada área.',
      },
      {
        id: EN_NOTE,
        title: 'Launch plan',
        content:
          'The product launch timeline and the go-to-market milestones for the new release.',
      },
    ];
    await db
      .insert(notes)
      .values(seed.map((n) => ({ ...n, ownerId: USER })))
      .onConflictDoNothing();
    const { embeddings } = await embed.embedDocuments(
      seed.map((n) => `${n.title}\n\n${n.content}`)
    );
    await db
      .insert(noteEmbeddings)
      .values(
        seed.map((n, i) => ({
          noteId: n.id,
          embedding: embeddings[i],
          model: MODEL,
          inputHash: `seed-${i}`,
        }))
      )
      .onConflictDoNothing();
  }, 120_000);

  afterAll(async () => {
    if (db) {
      await db.delete(users).where(eq(users.id, USER));
    }
    if (moduleClose) {
      await moduleClose();
    }
  });

  const MAX_RANK = 3;
  for (const c of CASES) {
    it(`ranks the expected note for: ${c.name}`, async () => {
      const hits = await adapter.search(USER, c.query);
      const rank = hits.findIndex((h) => h.id === c.expected);
      expect(rank).toBeGreaterThanOrEqual(0);
      expect(rank).toBeLessThan(MAX_RANK);
    }, 60_000);
  }
});

if (!GATE) {
  describe('hybrid retrieval quality', () => {
    it.skip('requires VOYAGE_API_KEY', () => undefined);
  });
}
