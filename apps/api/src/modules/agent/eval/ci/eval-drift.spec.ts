import { describe, expect, it, vi } from 'vitest';

import {
  candidateRunIds,
  DRIFT_SIGNIFICANCE_ALPHA,
  escapeMarkdown,
  findBaselines,
  hasLiveArtifact,
  isCompleteSummary,
  isSignificantRegression,
  mcnemarExactP,
  pairedDrift,
  renderDriftReport,
  type Baseline,
} from './eval-drift';
import type { SummaryRead } from './eval-summary';

const MODEL = 'openrouter:deepseek/deepseek-v4-pro-0813';

interface CaseShape {
  readonly label: string;
  readonly passes: number;
  readonly trials?: number;
  readonly graderErrors?: number;
  readonly errors?: number;
  readonly turnErrors?: number;
  readonly category?: 'behavior' | 'security';
  readonly verdict?: 'pass' | 'fail' | 'inconclusive';
}

function evalCase({
  label,
  passes,
  trials = 3,
  graderErrors = 0,
  errors = 0,
  turnErrors = 0,
  category = 'behavior',
  verdict = 'pass',
}: CaseShape) {
  return {
    key: JSON.stringify({ message: label }),
    label,
    category,
    consequence: 'critical' as const,
    verdict,
    passes,
    graderErrors,
    errors,
    turnErrors,
    trials,
  };
}

function summary(
  suite: string,
  cases: readonly ReturnType<typeof evalCase>[],
  { model = MODEL, trials = 3 } = {}
) {
  return { suite, model, trials, cases: [...cases] };
}

function read(value: unknown): SummaryRead {
  return { status: 'read', raw: value };
}

function baseline(runId: string, value: ReturnType<typeof summary>): Baseline {
  return { runId, summary: value };
}

describe('isCompleteSummary', () => {
  it('accepts a summary whose every case graded every trial, failures included', () => {
    expect(
      isCompleteSummary(
        summary('copilot', [
          evalCase({ label: 'a', passes: 3 }),
          evalCase({ label: 'b', passes: 0, verdict: 'fail' }),
        ])
      )
    ).toBe(true);
  });

  it.each([
    [
      'an ungraded trial',
      [evalCase({ label: 'a', passes: 2, graderErrors: 1 })],
    ],
    ['an errored trial', [evalCase({ label: 'a', passes: 2, errors: 1 })]],
    [
      'a stalled security trial',
      [
        evalCase({
          label: 'a',
          passes: 2,
          turnErrors: 1,
          category: 'security',
          verdict: 'inconclusive',
        }),
      ],
    ],
    [
      'an inconclusive case',
      [evalCase({ label: 'a', passes: 3, verdict: 'inconclusive' })],
    ],
    [
      'a case with fewer trials than the run',
      [evalCase({ label: 'a', passes: 2, trials: 2 })],
    ],
    ['no cases', []],
  ] as const)('rejects a summary with %s', (_name, cases) => {
    expect(isCompleteSummary(summary('copilot', cases))).toBe(false);
  });
});

describe('findBaselines', () => {
  const COMPLETE_COPILOT = summary('copilot', [
    evalCase({ label: 'a', passes: 3 }),
  ]);
  const COMPLETE_REPLAY = summary('transcript-replay', [
    evalCase({ label: '{"id":"safe-tool"}', passes: 3 }),
  ]);
  const INCOMPLETE_REPLAY = summary('transcript-replay', [
    evalCase({ label: '{"id":"safe-tool"}', passes: 2, graderErrors: 1 }),
  ]);

  it('takes each suite from the newest run that left it complete, and stops loading once every suite has one', async () => {
    const runs: Record<string, ReadonlyMap<string, SummaryRead>> = {
      '30': new Map([
        ['copilot', read(COMPLETE_COPILOT)],
        ['transcript-replay', { status: 'missing' }],
      ]),
      '20': new Map([
        ['copilot', read(COMPLETE_COPILOT)],
        ['transcript-replay', read(INCOMPLETE_REPLAY)],
      ]),
      '10': new Map([
        ['copilot', read(COMPLETE_COPILOT)],
        ['transcript-replay', read(COMPLETE_REPLAY)],
      ]),
      '5': new Map(),
    };
    const loadRun = vi.fn(async (runId: string) => runs[runId] ?? new Map());

    const { baselines, errors } = await findBaselines(
      ['copilot', 'transcript-replay'],
      ['30', '20', '10', '5'],
      loadRun
    );

    expect(baselines).toEqual(
      new Map([
        ['copilot', baseline('30', COMPLETE_COPILOT)],
        ['transcript-replay', baseline('10', COMPLETE_REPLAY)],
      ])
    );
    expect(errors).toEqual([]);
    expect(loadRun.mock.calls.map(([runId]) => runId)).toEqual([
      '30',
      '20',
      '10',
    ]);
  });

  it('reports a run it could not load and keeps searching the older ones', async () => {
    const loadRun = vi.fn(async (runId: string) => {
      if (runId === '30') {
        throw new Error('gh: HTTP 502');
      }
      return new Map([['copilot', read(COMPLETE_COPILOT)]]);
    });

    const { baselines, errors } = await findBaselines(
      ['copilot'],
      ['30', '20'],
      loadRun
    );

    expect(baselines.get('copilot')?.runId).toBe('20');
    expect(errors).toEqual(['run 30: gh: HTTP 502']);
  });

  it('never takes a malformed summary as a baseline', async () => {
    const { baselines } = await findBaselines(
      ['copilot'],
      ['30'],
      async () => new Map([['copilot', read({ suite: 'copilot' })]])
    );

    expect(baselines.size).toBe(0);
  });
});

describe('candidateRunIds', () => {
  it('lists the earlier runs newest first, without the current one', () => {
    expect(
      candidateRunIds(
        [{ databaseId: 30 }, { databaseId: 25 }, { databaseId: 20 }],
        '25'
      )
    ).toEqual(['30', '20']);
  });

  it('throws on output that is not a run list, instead of comparing nothing', () => {
    expect(() => candidateRunIds({ runs: [] }, '1')).toThrow(/run list/);
  });
});

describe('hasLiveArtifact', () => {
  const listing = {
    total_count: 2,
    artifacts: [
      { name: 'eval-results-reference', expired: true },
      { name: 'eval-results-fast-model-security', expired: false },
    ],
  };

  it('finds an artifact by name only while it has not expired', () => {
    expect(hasLiveArtifact(listing, 'eval-results-fast-model-security')).toBe(
      true
    );
    expect(hasLiveArtifact(listing, 'eval-results-reference')).toBe(false);
    expect(hasLiveArtifact(listing, 'eval-results-default-model')).toBe(false);
  });

  it('throws on output that is not an artifact listing', () => {
    expect(() => hasLiveArtifact([], 'x')).toThrow(/artifact listing/);
  });
});

describe('escapeMarkdown', () => {
  it('keeps a label from breaking the table or rendering as markup', () => {
    expect(escapeMarkdown('a | b `c` *d* _e_ [f](g) <h> #i ~j\nk\\l')).toBe(
      'a \\| b \\`c\\` \\*d\\* \\_e\\_ \\[f\\](g) \\<h\\> \\#i \\~j k\\\\l'
    );
  });
});

describe('mcnemarExactP', () => {
  it.each([
    { b: 0, c: 0, p: 1 },
    { b: 1, c: 0, p: 1 },
    { b: 5, c: 0, p: 0.0625 },
    { b: 6, c: 0, p: 0.03125 },
    { b: 0, c: 6, p: 0.03125 },
    { b: 7, c: 1, p: 0.0703125 },
    { b: 8, c: 1, p: 0.0390625 },
    { b: 3, c: 3, p: 1 },
  ])('answers $p for b=$b, c=$c', ({ b, c, p }) => {
    expect(mcnemarExactP(b, c)).toBeCloseTo(p, 10);
  });
});

describe('isSignificantRegression', () => {
  const drift = (regressed: number, recovered: number) => ({
    pairs: regressed + recovered,
    regressed,
    recovered,
    pValue: mcnemarExactP(regressed, recovered),
  });

  it('holds at the significance level the policy names', () => {
    expect(DRIFT_SIGNIFICANCE_ALPHA).toBe(0.05);
  });

  it.each([
    { b: 6, c: 0, significant: true },
    { b: 8, c: 1, significant: true },
    { b: 5, c: 0, significant: false },
    { b: 7, c: 1, significant: false },
    { b: 0, c: 6, significant: false },
    { b: 0, c: 0, significant: false },
  ])('is $significant for b=$b, c=$c', ({ b, c, significant }) => {
    expect(isSignificantRegression(drift(b, c))).toBe(significant);
  });
});

describe('pairedDrift', () => {
  const pass = (label: string) => evalCase({ label, passes: 3 });
  const fail = (label: string) =>
    evalCase({ label, passes: 0, verdict: 'fail' });
  const blind = (label: string) =>
    evalCase({
      label,
      passes: 0,
      graderErrors: 3,
      verdict: 'inconclusive',
    });

  it('counts each verdict that flipped against its baseline, across suites', () => {
    const drift = pairedDrift(
      new Map([
        [
          'copilot',
          read(
            summary('copilot', [fail('worse'), pass('better'), pass('same')])
          ),
        ],
        ['transcript-replay', read(summary('transcript-replay', [fail('r')]))],
      ]),
      new Map([
        [
          'copilot',
          baseline(
            '7',
            summary('copilot', [pass('worse'), fail('better'), pass('same')])
          ),
        ],
        [
          'transcript-replay',
          baseline('8', summary('transcript-replay', [pass('r')])),
        ],
      ])
    );

    expect(drift).toEqual({
      pairs: 4,
      regressed: 2,
      recovered: 1,
      pValue: 1,
    });
  });

  it('pairs only the cases in both runs that graded trials in both', () => {
    const drift = pairedDrift(
      new Map([
        [
          'copilot',
          read(
            summary('copilot', [fail('kept'), fail('new'), blind('ungraded')])
          ),
        ],
      ]),
      new Map([
        [
          'copilot',
          baseline(
            '7',
            summary('copilot', [
              pass('kept'),
              pass('dropped'),
              pass('ungraded'),
            ])
          ),
        ],
      ])
    );

    expect(drift).toMatchObject({ pairs: 1, regressed: 1, recovered: 0 });
  });

  it('counts no flip for a case with no verdict', () => {
    const { verdict: _verdict, ...legacy } = pass('legacy');
    const drift = pairedDrift(
      new Map([['copilot', read(summary('copilot', [fail('legacy')]))]]),
      new Map([
        [
          'copilot',
          {
            runId: '7',
            summary: { ...summary('copilot', []), cases: [legacy] },
          },
        ],
      ])
    );

    expect(drift).toMatchObject({ regressed: 0, recovered: 0 });
  });

  it.each([
    ['another model', { model: 'anthropic:x' }],
    ['another trial count', { trials: 10 }],
  ])('compares nothing with a baseline of %s', (_name, overrides) => {
    const drift = pairedDrift(
      new Map([['copilot', read(summary('copilot', [fail('a')]))]]),
      new Map([
        ['copilot', baseline('7', summary('copilot', [pass('a')], overrides))],
      ])
    );

    expect(drift).toEqual({
      pairs: 0,
      regressed: 0,
      recovered: 0,
      pValue: 1,
    });
  });

  it.each<[string, SummaryRead]>([
    ['missing', { status: 'missing' }],
    ['unreadable', { status: 'unreadable', reason: 'x' }],
    ['malformed', read({ suite: 'copilot' })],
  ])('compares nothing for a %s current summary', (_name, current) => {
    expect(
      pairedDrift(
        new Map([['copilot', current]]),
        new Map([['copilot', baseline('7', summary('copilot', [pass('a')]))]])
      ).pairs
    ).toBe(0);
  });

  it('compares nothing without a baseline', () => {
    expect(
      pairedDrift(
        new Map([['copilot', read(summary('copilot', [fail('a')]))]]),
        new Map()
      ).pairs
    ).toBe(0);
  });
});

describe('renderDriftReport', () => {
  const base = summary('copilot', [
    evalCase({ label: 'steady', passes: 3 }),
    evalCase({ label: 'worse', passes: 3 }),
    evalCase({ label: 'better', passes: 1, verdict: 'fail' }),
    evalCase({ label: 'dropped', passes: 3 }),
  ]);
  const current = summary('copilot', [
    evalCase({ label: 'steady', passes: 3 }),
    evalCase({ label: 'worse', passes: 1, verdict: 'fail' }),
    evalCase({ label: 'better', passes: 3 }),
    evalCase({ label: 'new | case', passes: 2 }),
    evalCase({
      label: 'blind',
      passes: 0,
      graderErrors: 3,
      verdict: 'inconclusive',
    }),
  ]);

  function report(
    overrides: Partial<Parameters<typeof renderDriftReport>[0]> = {}
  ): string {
    return renderDriftReport({
      target: 'eval-security',
      current: new Map([
        ['copilot', read(current)],
        ['injection-guard', { status: 'missing' }],
      ]),
      baselines: new Map([['copilot', baseline('77', base)]]),
      lookback: 20,
      branch: 'main',
      errors: [],
      ...overrides,
    });
  }

  it('tables each case against its baseline run with its verdict and drift', () => {
    const lines = report().split('\n');

    expect(lines).toContain(
      `### copilot vs run 77 (${escapeMarkdown(MODEL)}, 3 trials)`
    );
    expect(lines).toEqual(
      expect.arrayContaining([
        '| steady | 3/3 | 3/3 | 0/3 | PASS | = |',
        '| worse | 3/3 | 1/3 | 0/3 | FAIL | REGRESSED |',
        '| better | 1/3 | 3/3 | 0/3 | PASS | improved |',
        '| new \\| case | - | 2/3 | 0/3 | PASS | new |',
        '| blind | - | -/0 | 3/3 | INCONCLUSIVE | new |',
        'Removed cases: dropped',
      ])
    );
  });

  it('counts a stalled security trial as ungraded and a stalled behavior trial as a graded failure', () => {
    const stalls = summary('copilot', [
      evalCase({
        label: 'guarded',
        passes: 2,
        turnErrors: 1,
        category: 'security',
        verdict: 'inconclusive',
      }),
      evalCase({ label: 'answered', passes: 2, turnErrors: 1 }),
    ]);
    const lines = report({
      current: new Map([['copilot', read(stalls)]]),
      baselines: new Map([['copilot', baseline('77', stalls)]]),
    }).split('\n');

    expect(lines).toEqual(
      expect.arrayContaining([
        '| guarded | 2/2 | 2/2 | 1/3 | INCONCLUSIVE | = |',
        '| answered | 2/3 | 2/3 | 0/3 | PASS | = |',
      ])
    );
  });

  it('reports the paired verdict flips with their exact McNemar p', () => {
    expect(report()).toContain(
      'Paired verdicts: 1 pass -> fail, 1 fail -> pass over 3 cases, exact McNemar p = 1.000.'
    );
  });

  it('names a significant regression', () => {
    const labels = ['a', 'b', 'c', 'd', 'e', 'f'];
    const shown = report({
      current: new Map([
        [
          'copilot',
          read(
            summary(
              'copilot',
              labels.map((label) =>
                evalCase({ label, passes: 0, verdict: 'fail' })
              )
            )
          ),
        ],
      ]),
      baselines: new Map([
        [
          'copilot',
          baseline(
            '77',
            summary(
              'copilot',
              labels.map((label) => evalCase({ label, passes: 3 }))
            )
          ),
        ],
      ]),
    });

    expect(shown).toContain(
      'Paired verdicts: 6 pass -> fail, 0 fail -> pass over 6 cases, exact McNemar p = 0.031.'
    );
    expect(shown).toContain('Significant regression: this leg fails.');
  });

  it('never names a regression it did not find', () => {
    expect(report()).not.toContain('Significant regression');
  });

  it('says when no case could be paired', () => {
    expect(report({ baselines: new Map() })).toContain(
      'Paired verdicts: no case pairs with a baseline.'
    );
  });

  it('lists every expected suite the run left no summary for', () => {
    expect(report()).toContain(
      'Missing suites: injection-guard, memory-poisoning (expected from eval-security).'
    );
  });

  it('names the branch its baselines came from', () => {
    const shown = report({ baselines: new Map(), branch: 'release' });

    expect(shown).toContain('## Eval drift vs earlier release runs');
    expect(shown).toContain(
      '### copilot: no complete baseline in the last 20 release runs.'
    );
  });

  it('says when a suite has no complete baseline in the lookback', () => {
    expect(report({ baselines: new Map() })).toContain(
      '### copilot: no complete baseline in the last 20 main runs.'
    );
  });

  it('refuses a comparison across models or trial counts', () => {
    expect(
      report({
        baselines: new Map([
          [
            'copilot',
            baseline(
              '77',
              summary('copilot', base.cases, { model: 'anthropic:x' })
            ),
          ],
        ]),
      })
    ).toContain(
      `### copilot: baseline run 77 is not comparable (model anthropic:x -> ${escapeMarkdown(MODEL)}, trials 3 -> 3).`
    );
  });

  it('reports a current summary it could not read', () => {
    expect(
      report({
        current: new Map([
          ['copilot', { status: 'unreadable', reason: 'Unexpected token' }],
          ['injection-guard', { status: 'missing' }],
        ]),
      })
    ).toContain('### copilot: unreadable summary (Unexpected token).');
  });

  it('surfaces gh errors instead of hiding them', () => {
    expect(report({ errors: ['gh run list: HTTP 401'] })).toContain(
      '- gh run list: HTTP 401'
    );
  });
});
