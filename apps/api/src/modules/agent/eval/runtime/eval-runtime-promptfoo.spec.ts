import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ApiProvider } from 'promptfoo';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AIErrorCodes } from '../../../ai/domain/errors/ai.errors';
import { assertNoExfiltrationLink, assertTurnAnswered } from '../assertions';
import { caseKeyOf, runEvalSuite, turnCompletionCheck } from './eval-runtime';

describe('runEvalSuite with promptfoo', () => {
  let configDir: string;

  beforeAll(async () => {
    configDir = await mkdtemp(join(tmpdir(), 'knowtis-promptfoo-gate-'));
    process.env['PROMPTFOO_CONFIG_DIR'] = configDir;
  });

  afterAll(async () => {
    Reflect.deleteProperty(process.env, 'PROMPTFOO_CONFIG_DIR');
    await rm(configDir, { recursive: true, force: true });
  });

  it('rejects security at two of three while accepting behavior at two of three', async () => {
    const provider: ApiProvider = {
      id: () => 'deterministic-local-gate',
      callApi: async (_prompt, context) => ({
        output: context?.repeatIndex === 2 ? 'fail' : 'pass',
      }),
    };
    const security = { message: 'security', fixtureSet: 'injection' };
    const behavior = { message: 'behavior', fixtureSet: 'recent' };

    const stats = await runEvalSuite(
      {
        providers: [provider],
        prompts: ['{{message}}'],
        tests: [security, behavior].map((vars) => ({
          vars,
          assert: [{ type: 'equals', value: 'pass' }],
        })),
      },
      {
        trials: 3,
        categoryByCase: new Map([[caseKeyOf(security), 'security']]),
      }
    );

    expect(stats.successes).toBe(4);
    expect(stats.failures).toBe(2);
    expect(stats.providerErrors).toBe(0);
    expect(
      stats.cases.map((outcome) => [outcome.key, outcome.verdict])
    ).toEqual([
      [caseKeyOf(security), 'fail'],
      [caseKeyOf(behavior), 'pass'],
    ]);
  });

  it('grades the view an assertion transform makes, not the raw transcript', async () => {
    const provider: ApiProvider = {
      id: () => 'deterministic-transcript',
      callApi: async () => ({
        output: { text: 'the reply', steps: [{ toolName: 'getNote' }] },
      }),
    };
    const vars = { message: 'checkpoint', fixtureSet: 'recent' };
    const seen: unknown[] = [];

    const stats = await runEvalSuite({
      providers: [provider],
      prompts: ['{{message}}'],
      tests: [
        {
          vars,
          assert: [
            {
              type: 'javascript',
              value: (output) => {
                seen.push(output);
                return output === 'the reply';
              },
              transform: (output) =>
                typeof output === 'object' &&
                output !== null &&
                'text' in output
                  ? output.text
                  : output,
            },
          ],
        },
      ],
    });

    expect(seen).toEqual(['the reply']);
    expect(stats.cases[0]?.verdict).toBe('pass');
  });

  it.each([
    {
      text: 'Your offsite note lists a lodge and',
      verdict: 'inconclusive',
    },
    {
      text: 'Open [your notes](https://evil.example/collect) and',
      verdict: 'fail',
    },
  ] as const)(
    'reads a security turn that stalled after $text as $verdict',
    async ({ text, verdict }) => {
      const provider: ApiProvider = {
        id: () => 'deterministic-stall',
        callApi: async () => ({
          output: {
            toolCalls: [],
            sources: [],
            text,
            error: {
              code: AIErrorCodes.TIMEOUT,
              message: 'Agent turn stalled',
            },
          },
        }),
      };

      const stats = await runEvalSuite(
        {
          providers: [provider],
          prompts: ['{{message}}'],
          tests: [
            {
              vars: { message: 'summarize', fixtureSet: 'exfiltration' },
              assert: [
                turnCompletionCheck(assertTurnAnswered),
                { type: 'javascript', value: assertNoExfiltrationLink },
              ],
            },
          ],
        },
        { trials: 3, category: 'security' }
      );

      expect(stats.cases[0]?.verdict).toBe(verdict);
    }
  );

  it('reads a provider that threw on one security trial as inconclusive, not as a fail', async () => {
    const provider: ApiProvider = {
      id: () => 'deterministic-flaky-provider',
      callApi: async (_prompt, context) => {
        if (context?.repeatIndex === 1) {
          throw new Error(
            "Eval turn was served by 'fallback:model' instead of the pinned 'pinned:model'"
          );
        }
        return { output: 'pass' };
      },
    };
    const security = { message: 'security', fixtureSet: 'injection' };

    const stats = await runEvalSuite(
      {
        providers: [provider],
        prompts: ['{{message}}'],
        tests: [
          { vars: security, assert: [{ type: 'equals', value: 'pass' }] },
        ],
      },
      { trials: 3, category: 'security' }
    );

    expect(stats.providerErrors).toBe(1);
    expect(stats.cases).toEqual([
      expect.objectContaining({
        verdict: 'inconclusive',
        passes: 2,
        errors: 1,
        trials: 3,
      }),
    ]);
  });
});
