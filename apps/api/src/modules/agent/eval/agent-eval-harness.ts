import * as path from 'node:path';

import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { I18nModule } from 'nestjs-i18n';

import { DEFAULT_LOCALE } from '@knowtis/shared-util';

import { validateEnv, type EnvConfig } from '../../../config/env.config';
import { DatabaseModule } from '../../../database';
import { AgentModule } from '../agent.module';
import type { AgentMessage } from '../domain/agent-message';
import {
  AGENT_ORCHESTRATOR,
  type AgentOrchestrator,
} from '../domain/ports/agent-orchestrator.port';
import { PENDING_MUTATION_STORE } from '../domain/ports/pending-mutation.store';
import { RETRIEVAL_PORT } from '../domain/ports/retrieval.port';
import type { NoteFixtureSetName } from './fixtures/note-sets';
import { resolveFixtureSet } from './fixtures/note-sets';
import { RecordingFixtureRetrieval } from './recording-fixture-retrieval';
import { drainEvents, type EvalTranscript } from './transcript';

const EVAL_USER_ID = '00000000-0000-4000-8000-000000000e7a';

const NOOP_PENDING_STORE = {
  save: () => Promise.resolve(),
  take: () => Promise.resolve(null),
};

export class AgentEvalHarness {
  private constructor(
    private readonly moduleRef: TestingModule,
    private readonly orchestrator: AgentOrchestrator,
    private readonly retrieval: RecordingFixtureRetrieval,
    private readonly maxSteps: number,
    private readonly maxTurnTokens: number
  ) {}

  static async boot(): Promise<AgentEvalHarness> {
    const retrieval = new RecordingFixtureRetrieval();
    // Replicates the global context AppModule provides. ThrottlerModule is
    // required because AIModule's throttled controllers can't instantiate
    // without it; Schedule/Collaboration/i18n-watch stay out (side effects).
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['.env.local', '.env'],
        }),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
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
      const config = moduleRef.get<ConfigService<EnvConfig, true>>(
        ConfigService,
        { strict: false }
      );
      const maxSteps = config.get('AI_AGENT_MAX_STEPS');
      const maxTurnTokens = config.get('AI_AGENT_TURN_TOKEN_BUDGET');

      return new AgentEvalHarness(
        moduleRef,
        orchestrator,
        retrieval,
        maxSteps,
        maxTurnTokens
      );
    } catch (error) {
      await moduleRef.close();
      throw error;
    }
  }

  async runCase(
    message: string,
    fixtureSet: NoteFixtureSetName,
    model: string
  ): Promise<EvalTranscript> {
    this.retrieval.seed(resolveFixtureSet(fixtureSet));
    const messages: AgentMessage[] = [{ role: 'user', content: message }];
    const events = this.orchestrator.run({
      userId: EVAL_USER_ID,
      messages,
      model,
      maxSteps: this.maxSteps,
      maxTurnTokens: this.maxTurnTokens,
    });
    const drained = await drainEvents(events);
    return { ...drained, toolCalls: this.retrieval.getCalls() };
  }

  async close(): Promise<void> {
    await this.moduleRef.close();
  }
}
