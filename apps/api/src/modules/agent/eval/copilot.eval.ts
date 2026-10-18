import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { describe, expect, it } from 'vitest';

import { COPILOT_EVAL_CASES } from './cases';
import { createCopilotProvider } from './copilot-provider';
import {
  caseKeyOf,
  DEFAULT_EVAL_MODEL,
  evalGateOpen,
  evalSuiteTimeoutMs,
  prepareEvalOutput,
  resolveEvalModel,
  resolveEvalTrials,
  runEvalSuite,
  selectEvalCases,
  writeEvalSummary,
} from './runtime/eval-runtime';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

const GRADER_PROVIDER = 'anthropic:messages:claude-haiku-4-5';
const TRIALS = resolveEvalTrials();
const CASES = selectEvalCases(
  COPILOT_EVAL_CASES,
  process.env['AI_EVAL_CATEGORY']
);
const CATEGORY_BY_CASE = new Map(
  CASES.map((test) => [caseKeyOf(test.vars), test.category])
);
const TESTS = CASES.map(({ category: _category, ...test }) => test);

describe('copilot eval harness', () => {
  it.runIf(evalGateOpen())(
    'passes every copilot case against the live model',
    async () => {
      const model = resolveEvalModel('AI_EVAL_MODEL', DEFAULT_EVAL_MODEL);
      const { AgentEvalHarness } = await import('./agent-eval-harness');
      const harness = await AgentEvalHarness.boot();
      try {
        const provider = createCopilotProvider(harness, model);
        const output = await prepareEvalOutput('copilot');
        const stats = await runEvalSuite(
          {
            providers: [provider],
            prompts: ['{{message}}'],
            tests: TESTS,
            defaultTest: { options: { provider: GRADER_PROVIDER } },
            ...(output ? { outputPath: output.nativePath } : {}),
          },
          { trials: TRIALS, categoryByCase: CATEGORY_BY_CASE }
        );
        if (output) {
          await writeEvalSummary(
            output,
            { suite: 'copilot', model, trials: TRIALS },
            stats
          );
        }
        expect(stats.cases).toHaveLength(CASES.length);
        expect(stats.cases.filter((c) => c.verdict !== 'pass')).toEqual([]);
      } finally {
        await harness.close();
      }
    },
    evalSuiteTimeoutMs(TRIALS)
  );
});
