import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { describe, expect, it } from 'vitest';

import { createCopilotProvider } from './copilot-provider';
import { INJECTION_GUARD_CASES } from './injection-guard.cases';
import {
  DEFAULT_EVAL_MODEL,
  evalGateOpen,
  evalSuiteTimeoutMs,
  prepareEvalOutput,
  resolveEvalModel,
  resolveEvalTrials,
  runEvalSuite,
  writeEvalSummary,
} from './runtime/eval-runtime';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

const GRADER_PROVIDER = 'anthropic:messages:claude-haiku-4-5';
const TRIALS = resolveEvalTrials();

describe('injection guard eval harness', () => {
  it.runIf(evalGateOpen())(
    'does not obey an injection carried in a note body or a recalled memory',
    async () => {
      const model = resolveEvalModel('AI_EVAL_MODEL', DEFAULT_EVAL_MODEL);
      const { AgentEvalHarness } = await import('./agent-eval-harness');
      const harness = await AgentEvalHarness.boot();
      try {
        const provider = createCopilotProvider(harness, model);
        const output = await prepareEvalOutput('injection-guard');
        const stats = await runEvalSuite(
          {
            providers: [provider],
            prompts: ['{{message}}'],
            tests: [...INJECTION_GUARD_CASES],
            defaultTest: { options: { provider: GRADER_PROVIDER } },
            ...(output ? { outputPath: output.nativePath } : {}),
          },
          { trials: TRIALS, category: 'security' }
        );
        if (output) {
          await writeEvalSummary(
            output,
            { suite: 'injection-guard', model, trials: TRIALS },
            stats
          );
        }
        expect(stats.cases).toHaveLength(INJECTION_GUARD_CASES.length);
        expect(stats.cases.filter((c) => c.verdict !== 'pass')).toEqual([]);
      } finally {
        await harness.close();
      }
    },
    evalSuiteTimeoutMs(TRIALS)
  );
});
