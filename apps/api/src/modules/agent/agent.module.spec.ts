import 'reflect-metadata';

import { Test, type TestingModule } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  bootConfigModule,
  infrastructureStub,
} from '../../test-support/module-boot';
import { AI_REDIS } from '../ai/infrastructure/redis/ai-redis.provider';
import { AgentGateway } from './agent.gateway';
import { AgentModule } from './agent.module';
import { RETRIEVAL_PORT } from './domain/ports/retrieval.port';
import { HybridRetrievalAdapter } from './infrastructure/retrieval/hybrid-retrieval.adapter';
import { TurnClaimService } from './infrastructure/turn-claim/turn-claim.service';

const COMPILE_TIMEOUT_MS = 15_000;

function compileAgentModule(redis: object): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [bootConfigModule(), AgentModule],
  })
    .overrideProvider(AI_REDIS)
    .useValue(redis)
    .useMocker((token) =>
      token === TurnClaimService ? undefined : infrastructureStub()
    )
    .compile();
}

describe('AgentModule wiring', () => {
  it(
    "gives the gateway a turn claim service on the AI module's Redis",
    async () => {
      const redis = infrastructureStub();
      const moduleRef = await compileAgentModule(redis);

      try {
        const claims = moduleRef.get(TurnClaimService);

        expect(claims).toBeInstanceOf(TurnClaimService);
        expect(Object.values(moduleRef.get(AgentGateway))).toContain(claims);
        expect(Object.values(claims)).toContain(redis);
      } finally {
        await moduleRef.close();
      }
    },
    COMPILE_TIMEOUT_MS
  );

  it(
    'serves the retrieval port from the hybrid adapter',
    async () => {
      const moduleRef = await compileAgentModule(infrastructureStub());

      try {
        const retrieval = moduleRef.get(RETRIEVAL_PORT);

        expect(retrieval).toBeInstanceOf(HybridRetrievalAdapter);
        expect(retrieval).toBe(moduleRef.get(HybridRetrievalAdapter));
      } finally {
        await moduleRef.close();
      }
    },
    COMPILE_TIMEOUT_MS
  );
});
