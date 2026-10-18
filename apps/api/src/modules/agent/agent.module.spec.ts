import 'reflect-metadata';

import { Test, type TestingModule } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  bootConfigModule,
  infrastructureStub,
} from '../../test-support/module-boot';
import { MessageQuotaService } from '../ai/application/services/message-quota.service';
import { AI_REDIS } from '../ai/infrastructure/redis/ai-redis.provider';
import { createExecutionContext } from '../ai/testing/create-execution-context';
import { AgentGateway } from './agent.gateway';
import { AgentModule } from './agent.module';
import { ExtractMemoriesHandler } from './application/extract-memories.handler';
import { RunAgentTurnHandler } from './application/run-agent-turn.handler';
import { MEMORY_SAFE_TOOLS, MEMORY_WEB_TOOLS } from './domain/memory-taint';
import { RETRIEVAL_PORT } from './domain/ports/retrieval.port';
import { MemoryExtractionTask } from './infrastructure/memory/memory-extraction.task';
import { ProposalCollector } from './infrastructure/orchestrator/proposal-collector';
import { WebFetchAllowlist } from './infrastructure/orchestrator/web-fetch-allowlist';
import { WebSourceCollector } from './infrastructure/orchestrator/web-source.collector';
import { HybridRetrievalAdapter } from './infrastructure/retrieval/hybrid-retrieval.adapter';
import {
  AGENT_TOOL_GROUPS,
  type AgentToolGroup,
} from './infrastructure/tools/agent-tool';
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

  it(
    "draws the turn handler's messages from the AI module's quota service",
    async () => {
      const moduleRef = await compileAgentModule(infrastructureStub());

      try {
        const quota = moduleRef.get(MessageQuotaService);

        expect(quota).toBeInstanceOf(MessageQuotaService);
        expect(Object.values(moduleRef.get(RunAgentTurnHandler))).toContain(
          quota
        );
      } finally {
        await moduleRef.close();
      }
    },
    COMPILE_TIMEOUT_MS
  );

  it(
    'gives the memory extraction task the extraction handler',
    async () => {
      const moduleRef = await compileAgentModule(infrastructureStub());

      try {
        expect(Object.values(moduleRef.get(MemoryExtractionTask))).toContain(
          moduleRef.get(ExtractMemoriesHandler)
        );
      } finally {
        await moduleRef.close();
      }
    },
    COMPILE_TIMEOUT_MS
  );

  it(
    'classifies every tool the registered groups build as safe or tainting for memory extraction',
    async () => {
      const moduleRef = await compileAgentModule(infrastructureStub());

      try {
        const groups = moduleRef.get<AgentToolGroup[]>(AGENT_TOOL_GROUPS);
        const names = groups.flatMap((group) =>
          Object.keys(
            group.build({
              phase: 'full',
              execution: createExecutionContext(),
              proposals: new ProposalCollector(),
              webSources: new WebSourceCollector(),
              webFetchAllowlist: new WebFetchAllowlist(),
            })
          )
        );
        const classified = new Set<string>([
          ...MEMORY_SAFE_TOOLS,
          ...MEMORY_WEB_TOOLS,
        ]);

        expect(names).toEqual(expect.arrayContaining([...classified]));
        expect(names.filter((name) => !classified.has(name))).toEqual([]);
      } finally {
        await moduleRef.close();
      }
    },
    COMPILE_TIMEOUT_MS
  );
});
