import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../config/env.config';
import { validateEnv } from '../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  users,
  type Database,
} from '../../../database';
import type { AIConfigService } from '../../ai/application/services/ai-config.service';
import type { AIRateLimitService } from '../../ai/application/services/ai-rate-limit.service';
import type { ByokService } from '../../ai/application/services/byok.service';
import type { ModelPreferenceService } from '../../ai/application/services/model-preference.service';
import type { EmbeddingPort } from '../../ai/domain/ports/embedding.port';
import { createTestCatalog } from '../../ai/testing/create-test-catalog';
import type { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import type { AgentEvent } from '../domain/agent-event';
import type { AgentMessage } from '../domain/agent-message';
import type { AgentOrchestrator } from '../domain/ports/agent-orchestrator.port';
import type { MemoryRepository } from '../domain/ports/memory.repository';
import type { PendingMutationStore } from '../domain/ports/pending-mutation.store';
import { DrizzleConversationRepository } from '../infrastructure/persistence/drizzle-conversation.repository';
import type { InjectionGuardService } from './injection-guard.service';
import { RunAgentTurnHandler } from './run-agent-turn.handler';

const USER = '00000000-0000-4000-8000-0000000000d1';
const OTHER = '00000000-0000-4000-8000-0000000000d2';
const MODEL = 'anthropic:claude-haiku-4-5-20251001';

loadEnv({ path: ['.env.local', '.env'] });
const DB_AVAILABLE = !!process.env['DATABASE_URL']?.trim();

const memoryOff = {
  searchForUser: vi.fn().mockResolvedValue([]),
} as unknown as MemoryRepository;
const embedStub = {
  embedQuery: vi.fn().mockResolvedValue(new Array(1024).fill(0)),
} as unknown as EmbeddingPort;
const flagsOff = {
  isEnabled: vi.fn().mockResolvedValue(false),
} as unknown as FeatureFlagsService;
const modelPreferenceStub = {
  getEffectiveDefault: vi.fn().mockResolvedValue(MODEL),
  assertSelectable: vi.fn(),
  isSelectable: vi.fn().mockReturnValue(true),
  isSelectableWith: vi.fn().mockReturnValue(true),
  byokProvidersFor: vi.fn().mockResolvedValue(new Set()),
  tierGatingOn: vi.fn().mockResolvedValue(false),
} as unknown as ModelPreferenceService;
const byokStub = {
  getApiKey: vi.fn().mockResolvedValue(null),
  enabledProviders: vi.fn().mockResolvedValue(new Set()),
  markUsed: vi.fn().mockResolvedValue(undefined),
} as unknown as ByokService;
const guardStub = {
  guard: vi.fn().mockResolvedValue({ safe: true }),
} as unknown as InjectionGuardService;
const aiConfigStub = {
  getReasoningEffort: vi.fn().mockResolvedValue('medium'),
} as unknown as AIConfigService;

describe.runIf(DB_AVAILABLE)('RunAgentTurnHandler durable memory', () => {
  let db: Database;
  let config: ConfigService<EnvConfig, true>;
  const seenMessages: string[][] = [];

  const orchestrator: AgentOrchestrator = {
    run: vi.fn(async function* (input): AsyncIterable<AgentEvent> {
      seenMessages.push(input.messages.map((m: AgentMessage) => m.content));
      yield { type: 'chunk', text: 'ack' };
      yield {
        type: 'done',
        usage: { inputTokens: 1, outputTokens: 1, model: MODEL },
        sources: [],
        knownNotes: [],
        webSources: [],
      };
    }),
  };

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
    config = moduleRef.get(ConfigService);
    await db
      .insert(users)
      .values([
        {
          id: USER,
          email: `e-${USER}@test.local`,
          name: 'E',
          isAnonymous: true,
        },
        {
          id: OTHER,
          email: `e-${OTHER}@test.local`,
          name: 'O',
          isAnonymous: true,
        },
      ])
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, USER));
    await db.delete(users).where(eq(users.id, OTHER));
  });

  it('reconstructs turn 1 on turn 2 from only conversationId + message', async () => {
    const rateLimit = {
      checkLimit: vi.fn().mockResolvedValue({ allowed: true }),
      recordUsage: vi.fn().mockResolvedValue(undefined),
      releaseReservation: vi.fn().mockResolvedValue(undefined),
    } as unknown as AIRateLimitService;
    const pendingStore = {
      save: vi.fn(),
      take: vi.fn().mockResolvedValue(null),
    } as unknown as PendingMutationStore;
    const handler = new RunAgentTurnHandler(
      orchestrator,
      rateLimit,
      config,
      pendingStore,
      createTestCatalog(),
      new DrizzleConversationRepository(db),
      memoryOff,
      embedStub,
      flagsOff,
      modelPreferenceStub,
      byokStub,
      guardStub,
      aiConfigStub
    );

    let conversationId: string | undefined;
    await handler.execute(
      { userId: USER, message: { content: 'my codeword is BLUE' } },
      {
        onChunk: vi.fn(),
        onDone: (u) => {
          conversationId = u.conversationId;
        },
        onError: vi.fn(),
        onProposal: vi.fn(),
      }
    );
    if (!conversationId) {
      throw new Error('turn 1 did not return a conversationId');
    }

    seenMessages.length = 0;
    await handler.execute(
      {
        userId: USER,
        conversationId,
        message: { content: 'what is my codeword?' },
      },
      {
        onChunk: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
        onProposal: vi.fn(),
      }
    );

    const turn2 = seenMessages[0];
    expect(turn2).toContain('my codeword is BLUE');
    expect(turn2).toContain('ack');
    expect(turn2[turn2.length - 1]).toBe('what is my codeword?');
  });

  it('rejects a conversationId owned by another user with forbidden', async () => {
    const repo = new DrizzleConversationRepository(db);
    const foreign = await repo.create({ userId: OTHER, title: 'private' });

    const rateLimit = {
      checkLimit: vi.fn().mockResolvedValue({ allowed: true }),
      recordUsage: vi.fn().mockResolvedValue(undefined),
      releaseReservation: vi.fn().mockResolvedValue(undefined),
    } as unknown as AIRateLimitService;
    const pendingStore = {
      save: vi.fn(),
      take: vi.fn().mockResolvedValue(null),
    } as unknown as PendingMutationStore;
    const handler = new RunAgentTurnHandler(
      orchestrator,
      rateLimit,
      config,
      pendingStore,
      createTestCatalog(),
      repo,
      memoryOff,
      embedStub,
      flagsOff,
      modelPreferenceStub,
      byokStub,
      guardStub,
      aiConfigStub
    );

    const onError = vi.fn();
    const onDone = vi.fn();
    await handler.execute(
      {
        userId: USER,
        conversationId: foreign.id,
        message: { content: 'leak it' },
      },
      { onChunk: vi.fn(), onDone, onError, onProposal: vi.fn() }
    );

    expect(onError).toHaveBeenCalledWith({
      code: 'forbidden',
      message: 'Conversation not found',
    });
    expect(onDone).not.toHaveBeenCalled();
  });
});
