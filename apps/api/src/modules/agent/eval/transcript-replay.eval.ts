import 'reflect-metadata';

import { config as loadEnv } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AgentEvalHarness } from './agent-eval-harness';
import {
  caseKeyOf,
  createStructuredProvider,
  evalGateOpen,
  evalSuiteTimeoutMs,
  prepareEvalOutput,
  resolveEvalModel,
  resolveEvalTrials,
  runEvalSuite,
  writeEvalSummary,
} from './runtime/eval-runtime';
import { FIXTURE_SET, REPLAY_GUARD_CASES } from './transcript-replay.fixtures';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });
const DEFAULT_AGENT_MODEL = 'anthropic:claude-sonnet-5';
const TRIALS = resolveEvalTrials();

describe.runIf(evalGateOpen())('transcript replay', () => {
  let harness: AgentEvalHarness;
  const model = resolveEvalModel('AI_EVAL_MODEL', DEFAULT_AGENT_MODEL);
  beforeAll(async () => {
    const { AgentEvalHarness } = await import('./agent-eval-harness');
    harness = await AgentEvalHarness.boot();
  }, 120_000);
  afterAll(async () => {
    await harness?.close();
  });
  it(
    'preserves useful replay and excludes unsafe history with strict security thresholds',
    async () => {
      const target = await prepareEvalOutput('transcript-replay');
      const provider = createStructuredProvider<{ id: string }, unknown>(
        'knowtis-history-replay',
        async ({ id }) => {
          const item = REPLAY_GUARD_CASES.find(
            (candidate) => candidate.id === id
          );
          if (!item) {
            throw new Error('Unknown replay eval case');
          }
          return harness.runReplayConversation(
            item.history,
            item.message,
            FIXTURE_SET,
            model
          );
        }
      );
      const stats = await runEvalSuite(
        {
          providers: [provider],
          prompts: ['{{id}}'],
          tests: REPLAY_GUARD_CASES.map((item) => ({
            description: item.id,
            vars: { id: item.id },
            assert: item.assert,
          })),
          ...(target ? { outputPath: target.nativePath } : {}),
        },
        {
          trials: TRIALS,
          categoryByCase: new Map(
            REPLAY_GUARD_CASES.map((item) => [
              caseKeyOf({ id: item.id }),
              item.category,
            ])
          ),
        }
      );
      if (target) {
        await writeEvalSummary(
          target,
          { suite: 'transcript-replay', model, trials: TRIALS },
          stats
        );
      }
      expect(stats.providerErrors).toBe(0);
      expect(stats.cases).toHaveLength(REPLAY_GUARD_CASES.length);
      expect(stats.cases.filter((c) => c.verdict !== 'pass')).toEqual([]);
    },
    evalSuiteTimeoutMs(TRIALS)
  );
});
