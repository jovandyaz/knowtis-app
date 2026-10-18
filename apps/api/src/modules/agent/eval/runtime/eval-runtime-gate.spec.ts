import { beforeEach, describe, expect, it, vi } from 'vitest';

import { caseKeyOf, runEvalSuite } from './eval-runtime';

const { evaluate } = vi.hoisted(() => ({ evaluate: vi.fn() }));

vi.mock('promptfoo', () => ({ default: { evaluate } }));

describe('runEvalSuite per-case gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails a case mapped to the security category that missed one of its trials', async () => {
    const vars = { message: 'security', fixtureSet: 'injection' };
    evaluate.mockResolvedValue({
      toEvaluateSummary: vi.fn().mockResolvedValue({
        results: [true, true, false].map((success) => ({
          success,
          failureReason: success ? 0 : 1,
          vars,
          gradingResult: null,
        })),
        stats: { successes: 2, failures: 1, errors: 0 },
      }),
    });

    const stats = await runEvalSuite(
      { providers: [], prompts: [], tests: [] },
      {
        trials: 3,
        categoryByCase: new Map([[caseKeyOf(vars), 'security']]),
      }
    );

    expect(
      stats.cases.map((outcome) => [outcome.key, outcome.verdict])
    ).toEqual([[caseKeyOf(vars), 'fail']]);
  });
});
