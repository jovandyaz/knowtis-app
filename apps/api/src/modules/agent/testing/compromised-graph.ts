import { randomUUID } from 'node:crypto';

import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { MODEL_CATALOG } from '@knowtis/ai-gateway';

import {
  DATABASE_CONNECTION,
  type Database,
} from '../../../database/database.module';
import { notePermissions } from '../../../database/schema/notes.schema';
import { users } from '../../../database/schema/users.schema';
import { AIRateLimitService } from '../../ai/application/services/ai-rate-limit.service';
import { ByokService } from '../../ai/application/services/byok.service';
import { InjectionClassifierService } from '../../ai/application/services/injection-classifier.service';
import { MessageQuotaService } from '../../ai/application/services/message-quota.service';
import { ModelPreferenceService } from '../../ai/application/services/model-preference.service';
import { TierResolver } from '../../ai/application/services/tier-resolver.service';
import { TurnEffortResolver } from '../../ai/application/services/turn-effort.resolver';
import {
  AI_STRUCTURED_OUTPUT_PROVIDER,
  type AIStructuredOutputProvider,
} from '../../ai/domain/ports/ai-structured-output.port';
import { EMBEDDING_PORT } from '../../ai/domain/ports/embedding.port';
import { WEB_SEARCH_PORT } from '../../ai/domain/ports/web-search.port';
import { ProviderRegistryFactory } from '../../ai/infrastructure/providers/provider-registry.factory';
import {
  AI_REDIS,
  type AIRedisProvider,
} from '../../ai/infrastructure/redis/ai-redis.provider';
import { TavilyWebSearchAdapter } from '../../ai/infrastructure/web-search/tavily-web-search.adapter';
import { createExecutionContext } from '../../ai/testing/create-execution-context';
import { createMessageQuotaStub } from '../../ai/testing/create-message-quota-stub';
import { createMockConfig } from '../../ai/testing/create-mock-config';
import { createTestCatalog } from '../../ai/testing/create-test-catalog';
import { CreateNoteHandler } from '../../notes/application/commands/create-note.handler';
import { ApproveMutationHandler } from '../application/approve-mutation.handler';
import { ExtractMemoriesHandler } from '../application/extract-memories.handler';
import {
  RunAgentTurnHandler,
  type RunAgentTurnCallbacks,
} from '../application/run-agent-turn.handler';
import {
  CONVERSATION_REPOSITORY,
  type ConversationRepository,
} from '../domain/ports/conversation.repository';
import type { ProposedMutation } from '../domain/proposed-mutation';
import { agentEvalModuleImports } from '../eval/agent-eval-module';
import { FixedEmbedding } from '../eval/memory-poisoning-harness';
import {
  ALWAYS_SAFE_CLASSIFIER,
  TAVILY_TEST_CONFIG,
} from './compromised-defaults';
import {
  scriptedModel,
  type ScriptedModel,
  type ScriptedStructuredOutput,
  type ScriptEntry,
} from './scripted-model';

/** The model every turn on the graph is pinned to; the provider registry answers it with a script. */
export const GRAPH_MODEL = 'anthropic:claude-haiku-4-5';
const PROPOSAL_KEY_PATTERN = 'agent:proposal:*';
const ACCOUNT_EMAIL_DOMAIN = 'compromised.test';
const UNLIMITED_ALLOWANCE = { tokenLimit: 10_000_000, costLimit: 1_000 };

const ALLOW_EVERY_TURN = {
  dailyAllowance: () => UNLIMITED_ALLOWANCE,
  checkLimit: () =>
    Promise.resolve({
      allowed: true,
      reservation: { estimate: { tokens: 0, costUsd: 0 } },
    }),
  recordUsage: () => Promise.resolve(),
  releaseReservation: () => Promise.resolve(),
  recordSideCost: () => Promise.resolve(),
};

const PINNED_MODEL = {
  chooseTurnModel: () =>
    Promise.resolve({
      kind: 'resolved',
      model: GRAPH_MODEL,
      resolution: { requested: null, resolved: GRAPH_MODEL },
    }),
  reasoningFor: () => Promise.resolve(null),
  forgetRetiredPick: () => Promise.resolve(),
};

const NO_STORED_KEYS = {
  resolveKey: () => Promise.resolve({ kind: 'missing' }),
  enabledProviders: () => Promise.resolve(new Set()),
  markUsed: () => Promise.resolve(),
};

const TIER_BY_ACCOUNT = {
  resolve: (caller: { userId: string; isAnonymous: boolean }) =>
    Promise.resolve(
      createExecutionContext({
        userId: caller.userId,
        tier: caller.isAnonymous ? 'anonymous' : 'free',
      })
    ),
};

const NO_EFFORT = { resolve: () => Promise.resolve(undefined) };

export interface TurnRequest {
  readonly userId: string;
  readonly message: string;
  readonly isAnonymous?: boolean;
  readonly conversationId?: string;
}

export interface TurnOutcome {
  readonly userId: string;
  readonly turnId: string;
  readonly conversationId: string | undefined;
  readonly proposals: readonly ProposedMutation[];
  readonly errors: readonly { code: string; message: string }[];
  readonly done: boolean;
  readonly text: string;
  readonly scripted: ScriptedModel;
}

export interface ProposalRecord {
  readonly key: string;
  readonly record: unknown;
}

export interface CompromisedGraph {
  readonly db: Database;
  readonly conversations: ConversationRepository;
  readonly turns: RunAgentTurnHandler;
  readonly approvals: ApproveMutationHandler;
  readonly memories: ExtractMemoriesHandler;
  readonly createNote: CreateNoteHandler;
  play(script: readonly ScriptEntry[]): ScriptedModel;
  answerStructured(structured: ScriptedStructuredOutput): void;
  runTurn(
    request: TurnRequest,
    script: readonly ScriptEntry[]
  ): Promise<TurnOutcome>;
  /** The proposals parked in Redis for `userIds`, parsed. */
  proposalRecords(userIds: readonly string[]): Promise<ProposalRecord[]>;
  deleteProposalRecords(userIds: readonly string[]): Promise<void>;
  close(): Promise<void>;
}

function parsedRecord(raw: string | null): unknown {
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function userIdOf(record: unknown): unknown {
  return typeof record === 'object' && record !== null && 'userId' in record
    ? record.userId
    : undefined;
}

/**
 * Boots `AgentModule` on the real database and Redis with the model and every check that could
 * mask a structural guarantee replaced: the injection classifier always answers safe, embeddings
 * are zero vectors, the model is pinned and answered by a script, no BYOK key exists, every
 * turn is within quota and budget, and Tavily runs on a test key so the egress recorder can
 * answer it.
 */
export async function bootCompromisedGraph(): Promise<CompromisedGraph> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: agentEvalModuleImports(),
  })
    .overrideProvider(InjectionClassifierService)
    .useValue(ALWAYS_SAFE_CLASSIFIER)
    .overrideProvider(EMBEDDING_PORT)
    .useValue(new FixedEmbedding())
    .overrideProvider(ModelPreferenceService)
    .useValue(PINNED_MODEL)
    .overrideProvider(ByokService)
    .useValue(NO_STORED_KEYS)
    .overrideProvider(TierResolver)
    .useValue(TIER_BY_ACCOUNT)
    .overrideProvider(MessageQuotaService)
    .useValue(createMessageQuotaStub())
    .overrideProvider(AIRateLimitService)
    .useValue(ALLOW_EVERY_TURN)
    .overrideProvider(TurnEffortResolver)
    .useValue(NO_EFFORT)
    .overrideProvider(MODEL_CATALOG)
    .useValue(createTestCatalog())
    .overrideProvider(WEB_SEARCH_PORT)
    .useValue(new TavilyWebSearchAdapter(createMockConfig(TAVILY_TEST_CONFIG)))
    .compile();
  try {
    await moduleRef.init();
  } catch (error) {
    await moduleRef.close();
    throw error;
  }
  const lookup = { strict: false } as const;
  const providers = moduleRef.get(ProviderRegistryFactory, lookup);
  const structured = moduleRef.get<AIStructuredOutputProvider>(
    AI_STRUCTURED_OUTPUT_PROVIDER,
    lookup
  );
  const redis = moduleRef.get<AIRedisProvider>(AI_REDIS, lookup).client;
  const turns = moduleRef.get(RunAgentTurnHandler, lookup);

  const play = (script: readonly ScriptEntry[]): ScriptedModel => {
    const scripted = scriptedModel(script);
    vi.spyOn(providers, 'languageModel').mockReturnValue(scripted.model);
    return scripted;
  };

  const proposalRecords = async (
    userIds: readonly string[]
  ): Promise<ProposalRecord[]> => {
    const keys = await redis.keys(PROPOSAL_KEY_PATTERN);
    const records = await Promise.all(
      keys.map(async (key) => ({
        key,
        record: parsedRecord(await redis.get(key)),
      }))
    );
    return records.filter(({ record }) => {
      const owner = userIdOf(record);
      return typeof owner === 'string' && userIds.includes(owner);
    });
  };

  return {
    db: moduleRef.get<Database>(DATABASE_CONNECTION, lookup),
    conversations: moduleRef.get<ConversationRepository>(
      CONVERSATION_REPOSITORY,
      lookup
    ),
    turns,
    approvals: moduleRef.get(ApproveMutationHandler, lookup),
    memories: moduleRef.get(ExtractMemoriesHandler, lookup),
    createNote: moduleRef.get(CreateNoteHandler, lookup),
    play,
    answerStructured: (fake) => {
      vi.spyOn(structured, 'generateStructuredOutput').mockImplementation(
        fake.provider.generateStructuredOutput
      );
    },
    runTurn: async (request, script) => {
      const scripted = play(script);
      const turnId = randomUUID();
      const proposals: ProposedMutation[] = [];
      const errors: { code: string; message: string }[] = [];
      let conversationId = request.conversationId;
      let done = false;
      let text = '';
      const callbacks: RunAgentTurnCallbacks = {
        onChunk: (chunk) => {
          text += chunk;
        },
        onDone: (usage) => {
          done = true;
          conversationId ??= usage.conversationId;
        },
        onError: (error) => {
          errors.push(error);
        },
        onProposal: ({ proposal }) => {
          proposals.push(proposal);
        },
        onConversation: (id) => {
          conversationId = id;
        },
      };
      await turns.execute(
        {
          userId: request.userId,
          turnId,
          message: { content: request.message },
          ...(request.isAnonymous ? { isAnonymous: true } : {}),
          ...(request.conversationId
            ? { conversationId: request.conversationId }
            : {}),
        },
        callbacks
      );
      return {
        userId: request.userId,
        turnId,
        conversationId,
        proposals,
        errors,
        done,
        text,
        scripted,
      };
    },
    proposalRecords,
    deleteProposalRecords: async (userIds) => {
      const keys = (await proposalRecords(userIds)).map(({ key }) => key);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    },
    close: () => moduleRef.close(),
  };
}

export function accountEmail(id: string): string {
  return `${id}@${ACCOUNT_EMAIL_DOMAIN}`;
}

/** Inserts an account per entry, each with a verified address unless anonymous. */
export async function seedAccounts(
  db: Database,
  accounts: readonly { readonly id: string; readonly isAnonymous?: boolean }[]
): Promise<void> {
  await db
    .insert(users)
    .values(
      accounts.map(({ id, isAnonymous = false }) => ({
        id,
        email: accountEmail(id),
        name: isAnonymous ? 'Guest' : 'Account',
        isAnonymous,
        emailVerifiedAt: isAnonymous ? null : new Date(),
      }))
    )
    .onConflictDoNothing();
}

export async function grantAccess(
  db: Database,
  noteId: string,
  userId: string,
  permission: 'viewer' | 'editor'
): Promise<void> {
  await db.insert(notePermissions).values({ noteId, userId, permission });
}
