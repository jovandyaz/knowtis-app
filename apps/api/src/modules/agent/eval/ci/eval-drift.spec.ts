import { describe, expect, it, vi } from 'vitest';

import {
  candidateRunIds,
  escapeMarkdown,
  findBaselines,
  hasLiveArtifact,
  isCompleteSummary,
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
