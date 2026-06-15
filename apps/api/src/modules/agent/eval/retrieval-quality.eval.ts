import 'reflect-metadata';

import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  noteEmbeddings,
  notes,
  users,
  type Database,
} from '../../../database';
import { AIModule } from '../../ai/ai.module';
import {
  EMBEDDING_PORT,
  type EmbeddingPort,
} from '../../ai/domain/ports/embedding.port';
import {
  NOTE_READ_REPOSITORY,
  type NoteReadRepository,
} from '../../notes/domain/ports/note-read.repository';
import { NotesModule } from '../../notes/notes.module';
import { HybridRetrievalAdapter } from '../infrastructure/retrieval/hybrid-retrieval.adapter';
import { KeywordRetrievalAdapter } from '../infrastructure/retrieval/keyword-retrieval.adapter';

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
        DatabaseModule,
        AIModule,
        NotesModule,
      ],
      providers: [KeywordRetrievalAdapter, HybridRetrievalAdapter],
    }).compile();
    await moduleRef.init();
    moduleClose = () => moduleRef.close();

    db = moduleRef.get<Database>(DATABASE_CONNECTION);
    adapter = moduleRef.get(HybridRetrievalAdapter);
    const embed = moduleRef.get<EmbeddingPort>(EMBEDDING_PORT);
    const read = moduleRef.get<NoteReadRepository>(NOTE_READ_REPOSITORY);
    void read;

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

  for (const c of CASES) {
    it(`ranks the expected note for: ${c.name}`, async () => {
      const hits = await adapter.search(USER, c.query);
      expect(hits.map((h) => h.id)).toContain(c.expected);
    }, 60_000);
  }
});

if (!GATE) {
  describe('hybrid retrieval quality', () => {
    it('skipped: VOYAGE_API_KEY not set', () => {
      expect(true).toBe(true);
    });
  });
}
