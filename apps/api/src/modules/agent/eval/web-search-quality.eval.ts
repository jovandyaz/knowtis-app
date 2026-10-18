import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { config as loadEnv } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { EnvConfig } from '../../../config/env.config';
import { createExecutionContext } from '../../ai/testing/create-execution-context';
import type { AgentEvent, WebSource } from '../domain/agent-event';
import {
  AGENT_ORCHESTRATOR,
  type AgentOrchestrator,
} from '../domain/ports/agent-orchestrator.port';
import { agentEvalModuleImports } from './agent-eval-module';
import { DEFAULT_EVAL_MODEL } from './runtime/eval-runtime';

loadEnv({ path: ['.env.local', '.env'], quiet: true });

const GATE =
  !!process.env['TAVILY_API_KEY']?.trim() &&
  !!process.env['ANTHROPIC_API_KEY']?.trim();
const USER = '00000000-0000-4000-8000-0000000000fa';
const EXECUTION = createExecutionContext({ userId: USER });

describe.runIf(GATE)('web search tool quality', () => {
  let orchestrator: AgentOrchestrator;
  let maxSteps: number;
  let maxTurnTokens: number;
  let moduleClose: () => Promise<void>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: agentEvalModuleImports(),
    }).compile();
    await moduleRef.init();
    moduleClose = () => moduleRef.close();

    orchestrator = moduleRef.get<AgentOrchestrator>(AGENT_ORCHESTRATOR, {
      strict: false,
    });
    const config = moduleRef.get<ConfigService<EnvConfig, true>>(
      ConfigService,
      {
        strict: false,
      }
    );
    maxSteps = config.get('AI_AGENT_MAX_STEPS');
    maxTurnTokens = config.get('AI_AGENT_TURN_TOKEN_BUDGET');
  }, 120_000);

  afterAll(async () => {
    if (moduleClose) {
      await moduleClose();
    }
  });

  it('cites web sources for a current public-web question', async () => {
    const model = process.env['AI_EVAL_MODEL']?.trim() || DEFAULT_EVAL_MODEL;
    const events = orchestrator.run({
      execution: EXECUTION,
      messages: [
        {
          role: 'user',
          content:
            'Search the public web and tell me: what is the latest stable major version of Node.js? Cite the source url.',
        },
      ],
      model,
      maxSteps,
      maxTurnTokens,
    });

    let webSources: readonly WebSource[] = [];
    for await (const event of events as AsyncIterable<AgentEvent>) {
      if (event.type === 'done') {
        webSources = event.webSources;
      }
    }

    expect(webSources.length).toBeGreaterThanOrEqual(1);
    expect(webSources[0]?.url).toMatch(/^https?:\/\//);
  }, 120_000);
});

if (!GATE) {
  describe('web search tool quality', () => {
    it.skip('requires TAVILY_API_KEY and ANTHROPIC_API_KEY', () => undefined);
  });
}
