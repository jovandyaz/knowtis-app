import * as path from 'node:path';

import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { I18nModule } from 'nestjs-i18n';

import {
  computeTokenCostUsd,
  MODEL_CATALOG,
  type ModelCatalog,
} from '@knowtis/ai-gateway';
import type { ReasoningEffort } from '@knowtis/shared-types';
import { DEFAULT_LOCALE } from '@knowtis/shared-util';

import { validateEnv, type EnvConfig } from '../../../config/env.config';
import { DatabaseModule } from '../../../database';
import { AIConfigService } from '../../ai/application/services/ai-config.service';
import { TurnEffortResolver } from '../../ai/application/services/turn-effort.resolver';
import { FallbackChainService } from '../../ai/infrastructure/providers/fallback-chain.service';
import { AgentModule } from '../agent.module';
import type { AgentMessage } from '../domain/agent-message';
import {
  AGENT_ORCHESTRATOR,
  type AgentOrchestrator,
} from '../domain/ports/agent-orchestrator.port';
import { PENDING_MUTATION_STORE } from '../domain/ports/pending-mutation.store';
import { RETRIEVAL_PORT } from '../domain/ports/retrieval.port';
import { sanitizeReplayHistory } from '../domain/replay-input-sanitizer';
import type { NoteFixtureSetName } from './fixtures/note-sets';
import { resolveFixtureSet } from './fixtures/note-sets';
import {
  assertPinnedModelAvailable,
  assertPinnedModelServed,
} from './pinned-model';
import { RecordingFixtureRetrieval } from './recording-fixture-retrieval';
import { drainEvents, type EvalTranscript } from './transcript';

const EVAL_USER_ID = '00000000-0000-4000-8000-000000000e7a';

/** The per-turn inputs `RunAgentTurnHandler` resolves before it calls the
 *  orchestrator. The harness calls the orchestrator directly, so without these
 *  an eval turn would reach a different upstream, at a different reasoning
 *  effort, than the turn a user gets. */
export interface EvalTurnSettings {
  openRouterProviderOrder(): Promise<readonly string[]>;
  openRouterIgnoredProviders(): Promise<readonly string[]>;
  effortFor(model: string): Promise<ReasoningEffort | undefined>;
}

const NOOP_PENDING_STORE = {
  save: () => Promise.resolve(),
  take: () => Promise.resolve(null),
};

export class AgentEvalHarness {
  private constructor(
    private readonly moduleRef: Pick<TestingModule, 'close'>,
    private readonly orchestrator: AgentOrchestrator,
    private readonly fallbackChain: FallbackChainService,
    private readonly catalog: ModelCatalog,
    private readonly retrieval: RecordingFixtureRetrieval,
    private readonly turnSettings: EvalTurnSettings,
    private readonly maxSteps: number,
    private readonly maxTurnTokens: number
  ) {}

  /** Builds a harness over ready-made collaborators, for suites that must not boot the module graph. */
  static withCollaborators(deps: {
    moduleRef: Pick<TestingModule, 'close'>;
    orchestrator: AgentOrchestrator;
    fallbackChain: FallbackChainService;
    catalog: ModelCatalog;
    retrieval: RecordingFixtureRetrieval;
    turnSettings: EvalTurnSettings;
    maxSteps: number;
    maxTurnTokens: number;
  }): AgentEvalHarness {
    return new AgentEvalHarness(
      deps.moduleRef,
      deps.orchestrator,
      deps.fallbackChain,
      deps.catalog,
      deps.retrieval,
      deps.turnSettings,
      deps.maxSteps,
      deps.maxTurnTokens
    );
  }

  static async boot(): Promise<AgentEvalHarness> {
    const retrieval = new RecordingFixtureRetrieval();
    // Replicates the global context AppModule provides; Schedule, Collaboration
    // and the i18n watcher stay out because of their side effects.
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
    })
      .overrideProvider(RETRIEVAL_PORT)
      .useValue(retrieval)
      .overrideProvider(PENDING_MUTATION_STORE)
      .useValue(NOOP_PENDING_STORE)
      .compile();

    try {
      // ProviderRegistryFactory and other providers build their state in
      // onModuleInit, so the orchestrator only works after lifecycle init.
      await moduleRef.init();

      const orchestrator = moduleRef.get<AgentOrchestrator>(
        AGENT_ORCHESTRATOR,
        {
          strict: false,
        }
      );
      const fallbackChain = moduleRef.get(FallbackChainService, {
        strict: false,
      });
      const catalog = moduleRef.get<ModelCatalog>(MODEL_CATALOG, {
        strict: false,
      });
      const config = moduleRef.get<ConfigService<EnvConfig, true>>(
        ConfigService,
        { strict: false }
      );
      const aiConfig = moduleRef.get(AIConfigService, { strict: false });
      const turnEffort = moduleRef.get(TurnEffortResolver, { strict: false });
      const turnSettings: EvalTurnSettings = {
        openRouterProviderOrder: () => aiConfig.getOpenRouterProviderOrder(),
        openRouterIgnoredProviders: () =>
          aiConfig.getOpenRouterIgnoredProviders(),
        effortFor: (model) =>
          turnEffort.resolve({ userId: EVAL_USER_ID, model, isByok: false }),
      };
      const maxSteps = config.get('AI_AGENT_MAX_STEPS');
      const maxTurnTokens = config.get('AI_AGENT_TURN_TOKEN_BUDGET');

      return new AgentEvalHarness(
        moduleRef,
        orchestrator,
        fallbackChain,
        catalog,
        retrieval,
        turnSettings,
        maxSteps,
        maxTurnTokens
      );
    } catch (error) {
      await moduleRef.close();
      throw error;
    }
  }

  /** Runs one turn over a full message history, so a replayed transcript can be fed back to the agent. */
  async runConversation(
    messages: readonly AgentMessage[],
    fixtureSet: NoteFixtureSetName,
    model: string
  ): Promise<EvalTranscript> {
    assertPinnedModelAvailable(this.fallbackChain.candidatesFor(model), model);
    this.retrieval.seed(resolveFixtureSet(fixtureSet));
    const [openrouterProviderOrder, openrouterIgnoredProviders] =
      await Promise.all([
        this.turnSettings.openRouterProviderOrder(),
        this.turnSettings.openRouterIgnoredProviders(),
      ]);
    const events = this.orchestrator.run({
      userId: EVAL_USER_ID,
      messages,
      model,
      maxSteps: this.maxSteps,
      maxTurnTokens: this.maxTurnTokens,
      effortFor: (candidate) => this.turnSettings.effortFor(candidate),
      openrouterProviderOrder,
      openrouterIgnoredProviders,
    });
    const drained = await drainEvents(events);
    assertPinnedModelServed(drained, model);
    const pricing = drained.servedModel
      ? this.catalog.getPricing(drained.servedModel)
      : undefined;
    const costUsd =
      drained.usage && pricing
        ? computeTokenCostUsd(drained.usage, pricing)
        : null;
    return { ...drained, costUsd, toolCalls: this.retrieval.getCalls() };
  }

  /** Enforces replay protection for evals while retaining a separately supplied fresh request. */
  async runReplayConversation(
    history: readonly AgentMessage[],
    latestUserContent: string,
    fixtureSet: NoteFixtureSetName,
    model: string
  ): Promise<
    EvalTranscript & { replay: { detected: number; dropped: number } }
  > {
    const sanitized = sanitizeReplayHistory(history);
    const transcript = await this.runConversation(
      [...sanitized.messages, { role: 'user', content: latestUserContent }],
      fixtureSet,
      model
    );
    return {
      ...transcript,
      replay: {
        detected: sanitized.detections.length,
        dropped: sanitized.detections.filter(
          (entry) => entry.disposition === 'block'
        ).length,
      },
    };
  }

  async runCase(
    message: string,
    fixtureSet: NoteFixtureSetName,
    model: string
  ): Promise<EvalTranscript> {
    return this.runConversation(
      [{ role: 'user', content: message }],
      fixtureSet,
      model
    );
  }

  async close(): Promise<void> {
    await this.moduleRef.close();
  }
}
