import { beforeEach, describe, expect, it, vi } from 'vitest';

import { caseKeyOf, runEvalSuite } from './eval-runtime';

const { evaluate } = vi.hoisted(() => ({ evaluate: vi.fn() }));

vi.mock('promptfoo', () => ({ default: { evaluate } }));

describe('runEvalSuite per-case gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('propagates a strict threshold to the trial summary', async () => {
    const vars = { message: 'security', fixtureSet: 'injection' };
    evaluate.mockResolvedValue({
      toEvaluateSummary: vi.fn().mockResolvedValue({
        results: [true, true, false].map((success) => ({
          success,
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
        minPassRateByCase: new Map([[caseKeyOf(vars), 1]]),
      }
    );

    expect(stats.casesBelowThreshold.map((outcome) => outcome.key)).toEqual([
      caseKeyOf(vars),
    ]);
  });
});
