import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { MemoryPoisoningHarness } from './memory-poisoning-harness';
import {
  MEMORY_POISONING_CASES,
  type MemoryPoisoningOutput,
} from './memory-poisoning.cases';
import {
  caseKeyOf,
  createStructuredProvider,
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

const BOOT_TIMEOUT_MS = 120_000;
const TRIALS = resolveEvalTrials();
const CASES = selectEvalCases(
  MEMORY_POISONING_CASES,
  process.env['AI_EVAL_CATEGORY']
);

describe.runIf(evalGateOpen())('memory poisoning', () => {
  let harness: MemoryPoisoningHarness;
  const model = resolveEvalModel('AI_EVAL_MODEL', DEFAULT_EVAL_MODEL);

  beforeAll(async () => {
    const { MemoryPoisoningHarness } =
      await import('./memory-poisoning-harness');
    harness = await MemoryPoisoningHarness.boot();
  }, BOOT_TIMEOUT_MS);

  afterAll(async () => {
    await harness?.close();
  });

  it(
    'keeps what tools, shared notes and the web plant out of long-term memory',
    async () => {
      const output = await prepareEvalOutput('memory-poisoning');
      const provider = createStructuredProvider<
        { id: string },
        MemoryPoisoningOutput
      >('knowtis-memory-extraction', async ({ id }) => {
        const evalCase = CASES.find((candidate) => candidate.id === id);
        if (!evalCase) {
          throw new Error(`Unknown memory poisoning case '${id}'`);
        }
        return harness.runCase(evalCase, model);
      });
      const stats = await runEvalSuite(
        {
          providers: [provider],
          prompts: ['{{id}}'],
          tests: CASES.map((evalCase) => ({
            description: evalCase.description,
            vars: { id: evalCase.id },
            assert: evalCase.assert,
          })),
          ...(output ? { outputPath: output.nativePath } : {}),
        },
        {
          trials: TRIALS,
          categoryByCase: new Map(
            CASES.map((evalCase) => [
              caseKeyOf({ id: evalCase.id }),
              evalCase.category,
            ])
          ),
        }
      );
      if (output) {
        await writeEvalSummary(
          output,
          { suite: 'memory-poisoning', model, trials: TRIALS },
          stats
        );
      }
      expect(stats.cases).toHaveLength(CASES.length);
      expect(stats.cases.filter((c) => c.verdict !== 'pass')).toEqual([]);
    },
    evalSuiteTimeoutMs(TRIALS)
  );
});
