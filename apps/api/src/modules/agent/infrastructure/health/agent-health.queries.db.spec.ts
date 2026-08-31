import { randomUUID } from 'node:crypto';

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  conversationMessages,
  conversations,
  DATABASE_CONNECTION,
  DatabaseModule,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import {
  AGENT_MESSAGE_PARTS_VERSION,
  type PersistedParts,
  type ToolOutputType,
} from '../../domain/agent-message';
import type { AgentHealthWindowStats } from './agent-health.evaluator';
import { AgentHealthQueries } from './agent-health.queries';

const USER = '00000000-0000-4000-8000-000000000181';
const CONVERSATION = '00000000-0000-4000-8000-000000000182';

function toolResultParts(outputType: ToolOutputType): PersistedParts {
  return {
    v: AGENT_MESSAGE_PARTS_VERSION,
    parts: [
      {
        type: 'tool-result',
        toolCallId: 't1',
        toolName: 'searchNotes',
        output: 'ok',
        outputType,
      },
    ],
  };
}

describe.runIf(DB_AVAILABLE)('AgentHealthQueries', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let queries: AgentHealthQueries;
  let since: Date;
  let baseline: AgentHealthWindowStats;

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
      providers: [AgentHealthQueries],
    }).compile();
    db = moduleRef.get<Database>(DATABASE_CONNECTION);
    queries = moduleRef.get(AgentHealthQueries);

    await db
      .insert(users)
      .values({
        id: USER,
        email: `e-${USER}@test.local`,
        name: 'E',
        isAnonymous: true,
      })
      .onConflictDoNothing();
    await db
      .insert(conversations)
      .values({ id: CONVERSATION, userId: USER, title: 'health window' })
      .onConflictDoNothing();

    // The queries aggregate globally, so a shared dev DB with recent agent
    // activity would break exact counts; assert the delta over this baseline.
    since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    baseline = await queries.collectWindowStats(since);

    const outOfWindow = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await db.insert(conversationMessages).values([
      {
        conversationId: CONVERSATION,
        turnId: randomUUID(),
        role: 'tool',
        content: '',
        parts: toolResultParts('text'),
      },
      {
        conversationId: CONVERSATION,
        turnId: randomUUID(),
        role: 'tool',
        content: '',
        parts: toolResultParts('text'),
      },
      {
        conversationId: CONVERSATION,
        turnId: randomUUID(),
        role: 'tool',
        content: '',
        parts: toolResultParts('error-text'),
      },
      {
        conversationId: CONVERSATION,
        turnId: randomUUID(),
        role: 'tool',
        content: '',
        parts: toolResultParts('error-text'),
        createdAt: outOfWindow,
      },
      {
        conversationId: CONVERSATION,
        turnId: randomUUID(),
        role: 'assistant',
        content: 'a',
        stopReason: 'completed',
      },
      {
        conversationId: CONVERSATION,
        turnId: randomUUID(),
        role: 'assistant',
        content: 'a',
        stopReason: 'completed',
      },
      {
        conversationId: CONVERSATION,
        turnId: randomUUID(),
        role: 'assistant',
        content: 'a',
        stopReason: 'max_steps',
      },
      {
        conversationId: CONVERSATION,
        turnId: randomUUID(),
        role: 'assistant',
        content: 'a',
        stopReason: 'aborted',
      },
      {
        conversationId: CONVERSATION,
        turnId: randomUUID(),
        role: 'assistant',
        content: 'a',
        stopReason: 'error',
        createdAt: outOfWindow,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, USER));
    await moduleRef.close();
  });

  it('counts tool results, tool errors, stop turns, and anomalous stops inside the window', async () => {
    const stats = await queries.collectWindowStats(since);
    expect({
      toolCalls: stats.toolCalls - baseline.toolCalls,
      toolErrors: stats.toolErrors - baseline.toolErrors,
      stopTurns: stats.stopTurns - baseline.stopTurns,
      anomalousStops: stats.anomalousStops - baseline.anomalousStops,
    }).toEqual({
      toolCalls: 3,
      toolErrors: 1,
      stopTurns: 3,
      anomalousStops: 1,
    });
  });
});
