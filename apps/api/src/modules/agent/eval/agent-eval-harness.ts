import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { validateEnv, type EnvConfig } from '../../../config/env.config';
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

const EVAL_USER_ID = '00000000-0000-4000-8000-0000000000ev';

const NOOP_PENDING_STORE = {
  save: () => Promise.resolve(),
  take: () => Promise.resolve(null),
};

export class AgentEvalHarness {
  private constructor(
    private readonly moduleRef: TestingModule,
    private readonly orchestrator: AgentOrchestrator,
    private readonly retrieval: RecordingFixtureRetrieval,
    private readonly maxSteps: number
  ) {}

  static async boot(): Promise<AgentEvalHarness> {
    const retrieval = new RecordingFixtureRetrieval();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['apps/api/.env.local', 'apps/api/.env'],
        }),
        AgentModule,
      ],
    })
      .overrideProvider(RETRIEVAL_PORT)
      .useValue(retrieval)
      .overrideProvider(PENDING_MUTATION_STORE)
      .useValue(NOOP_PENDING_STORE)
      .compile();

    const orchestrator = moduleRef.get<AgentOrchestrator>(AGENT_ORCHESTRATOR);
    const config = moduleRef.get<ConfigService<EnvConfig, true>>(ConfigService);
    const maxSteps = config.get('AI_AGENT_MAX_STEPS');

    return new AgentEvalHarness(moduleRef, orchestrator, retrieval, maxSteps);
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
    });
    const drained = await drainEvents(events);
    return { ...drained, toolCalls: this.retrieval.getCalls() };
  }

  async close(): Promise<void> {
    await this.moduleRef.close();
  }
}
