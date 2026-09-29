import { randomUUID } from 'node:crypto';

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { MessageStopReason } from '@knowtis/shared-types';

import { validateEnv } from '../../../../config/env.config';
import {
  conversationMessages,
  conversations,
  DATABASE_CONNECTION,
  DatabaseModule,
  users,
  type Database,
  type NewConversationMessage,
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

function toolTurn(
  toolName: string,
  stopReason: MessageStopReason
): NewConversationMessage[] {
  const turnId = randomUUID();
  return [
    {
      conversationId: CONVERSATION,
      turnId,
      role: 'assistant',
      content: '',
      parts: {
        v: AGENT_MESSAGE_PARTS_VERSION,
        parts: [{ type: 'tool-call', toolCallId: 't1', toolName, input: {} }],
      },
    },
    {
      conversationId: CONVERSATION,
      turnId,
      role: 'tool',
      content: '',
      parts: {
        v: AGENT_MESSAGE_PARTS_VERSION,
        parts: [
          {
            type: 'tool-result',
            toolCallId: 't1',
            toolName,
            output: { ok: true },
            outputType: 'json',
          },
        ],
      },
    },
    {
      conversationId: CONVERSATION,
      turnId,
      role: 'assistant',
      content: '',
      stopReason,
    },
  ];
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
        content: '',
        stopReason: 'error',
        createdAt: outOfWindow,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, USER));
    await moduleRef.close();
  });

  async function deltaAfter(
    rows: NewConversationMessage[]
  ): Promise<Pick<AgentHealthWindowStats, 'terminalTurns' | 'noAnswerTurns'>> {
    const before = await queries.collectWindowStats(since);
    await db.insert(conversationMessages).values(rows);
    const after = await queries.collectWindowStats(since);
    return {
      terminalTurns: after.terminalTurns - before.terminalTurns,
      noAnswerTurns: after.noAnswerTurns - before.noAnswerTurns,
    };
  }

  it('counts tool results, tool errors, and terminal turns inside the window', async () => {
    const stats = await queries.collectWindowStats(since);
    expect({
      toolCalls: stats.toolCalls - baseline.toolCalls,
      toolErrors: stats.toolErrors - baseline.toolErrors,
      terminalTurns: stats.terminalTurns - baseline.terminalTurns,
      noAnswerTurns: stats.noAnswerTurns - baseline.noAnswerTurns,
    }).toEqual({
      toolCalls: 3,
      toolErrors: 1,
      terminalTurns: 3,
      noAnswerTurns: 0,
    });
  });

  it.each<[MessageStopReason | null, string, number, number]>([
    ['completed', 'answer', 1, 0],
    ['max_steps', 'answer', 1, 0],
    ['token_budget', 'answer', 1, 0],
    ['time_limit', 'answer', 1, 0],
    ['error', 'partial', 1, 1],
    ['length', 'answer', 1, 1],
    ['content_filter', 'answer', 1, 1],
    ['content_filter', '', 1, 1],
    ['completed', '', 1, 1],
    ['completed', ' \n\t ', 1, 1],
    ['max_steps', '', 1, 1],
    ['max_steps', '\n\n', 1, 1],
    ['aborted', 'answer', 0, 0],
    ['aborted', '', 0, 0],
    [null, '', 0, 0],
  ])(
    'counts a %s row with content %j as %i terminal and %i no-answer',
    async (stopReason, content, terminalTurns, noAnswerTurns) => {
      const delta = await deltaAfter([
        {
          conversationId: CONVERSATION,
          turnId: randomUUID(),
          role: 'assistant',
          content,
          stopReason,
        },
      ]);
      expect(delta).toEqual({ terminalTurns, noAnswerTurns });
    }
  );

  it('counts a blank proposal turn as answered, since the proposal card is the answer', async () => {
    const delta = await deltaAfter(toolTurn('proposeCreateNote', 'completed'));
    expect(delta).toEqual({ terminalTurns: 1, noAnswerTurns: 0 });
  });

  it('counts a blank turn after a read tool as no-answer', async () => {
    const delta = await deltaAfter(toolTurn('getNote', 'token_budget'));
    expect(delta).toEqual({ terminalTurns: 1, noAnswerTurns: 1 });
  });

  it('counts a proposal turn that ended on error as no-answer', async () => {
    const delta = await deltaAfter(toolTurn('proposeCreateNote', 'error'));
    expect(delta).toEqual({ terminalTurns: 1, noAnswerTurns: 1 });
  });

  it('does not let a proposal in one turn mask a blank row in another turn of the conversation', async () => {
    const delta = await deltaAfter([
      ...toolTurn('proposeCreateNote', 'completed'),
      ...toolTurn('getNote', 'completed'),
    ]);
    expect(delta).toEqual({ terminalTurns: 2, noAnswerTurns: 1 });
  });
});
