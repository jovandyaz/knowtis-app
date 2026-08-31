import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { describe, expect, it } from 'vitest';

import { COPILOT_EVAL_CASES } from './cases';
import { createCopilotProvider } from './copilot-provider';
import {
  evalGateOpen,
  resolveEvalModel,
  resolveEvalTrials,
  runEvalSuite,
} from './runtime/eval-runtime';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const DEFAULT_AGENT_MODEL = 'anthropic:claude-sonnet-5';
const GRADER_PROVIDER = 'anthropic:messages:claude-haiku-4-5';
const EVAL_TIMEOUT_MS = 300_000;
const TRIALS = resolveEvalTrials();

describe('copilot eval harness', () => {
  it.runIf(evalGateOpen())(
    'passes every behavior case against the live model',
    async () => {
      const model = resolveEvalModel('AI_EVAL_MODEL', DEFAULT_AGENT_MODEL);
      const { AgentEvalHarness } = await import('./agent-eval-harness');
      const harness = await AgentEvalHarness.boot();
      try {
        const provider = createCopilotProvider(harness, model);
        const stats = await runEvalSuite(
          {
            providers: [provider],
            prompts: ['{{message}}'],
            tests: COPILOT_EVAL_CASES,
            defaultTest: { options: { provider: GRADER_PROVIDER } },
          },
          { trials: TRIALS }
        );
        expect(stats.cases).toHaveLength(COPILOT_EVAL_CASES.length);
        expect(stats.casesBelowThreshold).toEqual([]);
      } finally {
        await harness.close();
      }
    },
    EVAL_TIMEOUT_MS * TRIALS
  );
});
