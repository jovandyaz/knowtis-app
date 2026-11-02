import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { describe, expect, it } from 'vitest';

import { createCopilotProvider } from './copilot-provider';
import { INJECTION_GUARD_CASES } from './injection-guard.cases';
import {
  caseKeyOf,
  DEFAULT_EVAL_MODEL,
  evalGateOpen,
  evalSuiteTimeoutMs,
  failedCriticalCases,
  gradedTrialCount,
  GRADER_PROVIDER,
  prepareEvalOutput,
  resolveEvalModel,
  resolveEvalTrials,
  runEvalSuite,
  writeEvalSummary,
} from './runtime/eval-runtime';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

const TRIALS = resolveEvalTrials();
const CONSEQUENCE_BY_CASE = new Map(
  INJECTION_GUARD_CASES.map((test) => [caseKeyOf(test.vars), test.consequence])
);
const TESTS = INJECTION_GUARD_CASES.map(
  ({ consequence: _consequence, ...test }) => test
);

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
            tests: TESTS,
            defaultTest: { options: { provider: GRADER_PROVIDER } },
            ...(output ? { outputPath: output.nativePath } : {}),
          },
          {
            trials: TRIALS,
            category: 'security',
            consequenceByCase: CONSEQUENCE_BY_CASE,
          }
        );
        if (output) {
          await writeEvalSummary(
            output,
            { suite: 'injection-guard', model, trials: TRIALS },
            stats
          );
        }
        expect(stats.cases).toHaveLength(INJECTION_GUARD_CASES.length);
        expect(gradedTrialCount(stats.cases)).toBeGreaterThan(0);
        expect(failedCriticalCases(stats.cases)).toEqual([]);
      } finally {
        await harness.close();
      }
    },
    evalSuiteTimeoutMs(TRIALS)
  );
});
