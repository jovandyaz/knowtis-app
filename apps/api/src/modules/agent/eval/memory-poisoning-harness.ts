import { randomUUID } from 'node:crypto';

import { Test, type TestingModule } from '@nestjs/testing';

import {
  computeTokenCostUsd,
  MODEL_CATALOG,
  type ModelCatalog,
} from '@knowtis/ai-gateway';

import { AIRateLimitService } from '../../ai/application/services/ai-rate-limit.service';
import {
  EMBEDDING_PORT,
  type EmbeddingPort,
  type EmbeddingResult,
  type QueryEmbedding,
} from '../../ai/domain/ports/embedding.port';
import { FallbackChainService } from '../../ai/infrastructure/providers/fallback-chain.service';
import {
  ExtractMemoriesHandler,
  MEMORY_FALLBACK_SCOPE,
} from '../application/extract-memories.handler';
import {
  CONVERSATION_REPOSITORY,
  type ConversationMessageRow,
  type ConversationRepository,
  type ExtractableConversation,
} from '../domain/ports/conversation.repository';
import {
  MEMORY_REPOSITORY,
  type MemoryReconcileBatch,
  type MemoryRepository,
  type UserMemoryRow,
} from '../domain/ports/memory.repository';
import {
  NOTE_EXPOSURE_REPOSITORY,
  type NoteExposure,
  type NoteExposureRepository,
} from '../domain/ports/note-exposure.repository';
import { agentEvalModuleImports } from './agent-eval-module';
import type {
  MemoryPoisoningCase,
  MemoryPoisoningOutput,
} from './memory-poisoning.cases';
import {
  assertPinnedModelAvailable,
  assertPinnedModelServed,
} from './pinned-model';

const EVAL_CONVERSATION: ExtractableConversation = {
  id: '00000000-0000-4000-8000-000000000e7c',
  userId: '00000000-0000-4000-8000-000000000e7b',
  version: 'memory-poisoning-eval',
  attempts: 0,
};
const EMBEDDING_DIMENSIONS = 1024;

type SeededConversations = Pick<
  ConversationRepository,
  'loadMessages' | 'markExtracted'
>;
type SeededMemories = Pick<
  MemoryRepository,
  'listForUser' | 'countForUser' | 'applyReconcile'
>;

/**
 * One seeded conversation, the exposure of the notes it names (a note left out is the user's alone),
 * and the user's memories, kept in process: an extraction run writes no database row, and its only
 * database read is `TierResolver` looking up the eval user's stored provider keys.
 */
export class SeededMemoryStore {
  private rows: readonly ConversationMessageRow[] = [];
  private memories: UserMemoryRow[] = [];
  private exposures: ReadonlyMap<string, NoteExposure> = new Map();

  readonly conversations: SeededConversations = {
    loadMessages: (_conversationId, _userId, limit) =>
      Promise.resolve([...this.rows.slice(-limit)]),
    markExtracted: () => Promise.resolve(),
  };

  readonly noteExposure: NoteExposureRepository = {
    findExposures: (_userId, noteIds) =>
      Promise.resolve(
        new Map(
          noteIds.flatMap((noteId): [string, NoteExposure][] => {
            const id = noteId.toLowerCase();
            const exposure = this.exposures.get(id);
            return exposure ? [[id, exposure]] : [];
          })
        )
      ),
  };

  readonly memoryRepository: SeededMemories = {
    listForUser: (_userId, limit) =>
      Promise.resolve(this.memories.slice(0, limit)),
    countForUser: () => Promise.resolve(this.memories.length),
    applyReconcile: (batch) => {
      this.apply(batch);
      return Promise.resolve();
    },
  };

  seed(
    rows: readonly ConversationMessageRow[],
    memories: readonly UserMemoryRow[],
    noteExposures: Readonly<Record<string, NoteExposure>> = {}
  ): void {
    this.rows = rows;
    this.memories = [...memories];
    this.exposures = new Map(
      Object.entries(noteExposures).map(([id, exposure]) => [
        id.toLowerCase(),
        exposure,
      ])
    );
  }

  contents(): string[] {
    return this.memories.map((memory) => memory.content);
  }

  private apply(batch: MemoryReconcileBatch): void {
    const deleted = new Set(batch.deletes);
    const updated = new Map(batch.updates.map((u) => [u.id, u.content]));
    this.memories = [
      ...this.memories
        .filter((memory) => !deleted.has(memory.id))
        .map((memory) => ({
          id: memory.id,
          content: updated.get(memory.id) ?? memory.content,
        })),
      ...batch.inserts.map(({ content }) => ({ id: randomUUID(), content })),
    ];
  }
}

/** Embeds every text as the same zero vector: the suite judges what is stored, never how it is recalled. */
export class FixedEmbedding implements EmbeddingPort {
  private readonly vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);

  isConfigured(): boolean {
    return true;
  }

  embedQuery(): Promise<QueryEmbedding> {
    return Promise.resolve({ vector: this.vector, costUsd: 0 });
  }

  embedDocuments(texts: string[]): Promise<EmbeddingResult> {
    return Promise.resolve({
      embeddings: texts.map(() => this.vector),
      totalTokens: 0,
      costUsd: 0,
    });
  }
}

const NO_METERING: Pick<AIRateLimitService, 'recordUsage' | 'recordSideCost'> =
  {
    recordUsage: () => Promise.resolve(),
    recordSideCost: () => Promise.resolve(),
  };

/** Runs the production `ExtractMemoriesHandler` (reconcile model, content policy, persistent guard and its classifier) over a seeded conversation. */
export class MemoryPoisoningHarness {
  private constructor(
    private readonly moduleRef: Pick<TestingModule, 'close'>,
    private readonly extractMemories: Pick<ExtractMemoriesHandler, 'execute'>,
    private readonly store: SeededMemoryStore,
    private readonly fallbackChain: Pick<FallbackChainService, 'candidatesFor'>,
    private readonly catalog: Pick<ModelCatalog, 'getPricing'>
  ) {}

  /** Builds a harness over ready-made collaborators, for specs that must not boot the module graph. */
  static withCollaborators(deps: {
    moduleRef: Pick<TestingModule, 'close'>;
    extractMemories: Pick<ExtractMemoriesHandler, 'execute'>;
    store: SeededMemoryStore;
    fallbackChain: Pick<FallbackChainService, 'candidatesFor'>;
    catalog: Pick<ModelCatalog, 'getPricing'>;
  }): MemoryPoisoningHarness {
    return new MemoryPoisoningHarness(
      deps.moduleRef,
      deps.extractMemories,
      deps.store,
      deps.fallbackChain,
      deps.catalog
    );
  }

  /** Boots `AgentModule` with the conversation, memory and note-exposure repositories on a {@link SeededMemoryStore}, a {@link FixedEmbedding}, and no usage metering; `TierResolver` still reads the eval user's stored provider keys from the database. */
  static async boot(): Promise<MemoryPoisoningHarness> {
    const store = new SeededMemoryStore();
    const moduleRef = await Test.createTestingModule({
      imports: agentEvalModuleImports(),
    })
      .overrideProvider(CONVERSATION_REPOSITORY)
      .useValue(store.conversations)
      .overrideProvider(MEMORY_REPOSITORY)
      .useValue(store.memoryRepository)
      .overrideProvider(NOTE_EXPOSURE_REPOSITORY)
      .useValue(store.noteExposure)
      .overrideProvider(EMBEDDING_PORT)
      .useValue(new FixedEmbedding())
      .overrideProvider(AIRateLimitService)
      .useValue(NO_METERING)
      .compile();
    try {
      await moduleRef.init();
      return new MemoryPoisoningHarness(
        moduleRef,
        moduleRef.get(ExtractMemoriesHandler, { strict: false }),
        store,
        moduleRef.get(FallbackChainService, { strict: false }),
        moduleRef.get<ModelCatalog>(MODEL_CATALOG, { strict: false })
      );
    } catch (error) {
      await moduleRef.close();
      throw error;
    }
  }

  async runCase(
    evalCase: Pick<MemoryPoisoningCase, 'rows' | 'existing' | 'noteExposures'>,
    model: string
  ): Promise<MemoryPoisoningOutput> {
    assertPinnedModelAvailable(
      this.fallbackChain.candidatesFor(model, MEMORY_FALLBACK_SCOPE),
      model
    );
    this.store.seed(evalCase.rows, evalCase.existing, evalCase.noteExposures);
    const outcome = await this.extractMemories.execute({
      conversation: EVAL_CONVERSATION,
      model,
      finalAttempt: false,
    });
    const servedModel = outcome.reconcile?.model ?? null;
    assertPinnedModelServed({ servedModel, error: null }, model);
    const usage = outcome.reconcile
      ? {
          inputTokens: outcome.reconcile.inputTokens,
          outputTokens: outcome.reconcile.outputTokens,
        }
      : null;
    const pricing = servedModel ? this.catalog.getPricing(servedModel) : null;
    return {
      taintReasons: [...outcome.taintReasons],
      memories: this.store.contents(),
      servedModel,
      usage,
      costUsd: usage && pricing ? computeTokenCostUsd(usage, pricing) : null,
      error: null,
    };
  }

  async close(): Promise<void> {
    await this.moduleRef.close();
  }
}
