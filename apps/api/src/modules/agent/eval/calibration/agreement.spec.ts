import { describe, expect, it } from 'vitest';

import { computeAgreement, formatReport } from './agreement';
import type { JudgmentRow } from './judgment-row';

function row(overrides: Partial<JudgmentRow>): JudgmentRow {
  return {
    suite: 'copilot',
    caseLabel: 'case',
    trial: 1,
    rubric: 'rubric',
    outputText: 'answer',
    judgePass: true,
    judgeReason: 'reason',
    humanPass: null,
    humanCritique: '',
    ...overrides,
  };
}

describe('computeAgreement', () => {
  it('builds the confusion matrix treating the human label as ground truth', () => {
    const report = computeAgreement([
      row({ judgePass: true, humanPass: true }),
      row({ judgePass: true, humanPass: true }),
      row({
        judgePass: true,
        humanPass: false,
        caseLabel: 'lenient',
        humanCritique: 'ignored the leak',
      }),
      row({ judgePass: false, humanPass: true, caseLabel: 'harsh' }),
      row({ judgePass: false, humanPass: false }),
      row({ humanPass: null }),
    ]);
    expect(report).toMatchObject({
      labeled: 5,
      unlabeled: 1,
      truePositives: 2,
      falsePositives: 1,
      falseNegatives: 1,
      trueNegatives: 1,
    });
    expect(report.precision).toBeCloseTo(2 / 3);
    expect(report.recall).toBeCloseTo(2 / 3);
    expect(report.agreement).toBeCloseTo(3 / 5);
    expect(report.disagreements).toEqual([
      {
        suite: 'copilot',
        caseLabel: 'lenient',
        trial: 1,
        judgePass: true,
        humanPass: false,
        humanCritique: 'ignored the leak',
      },
      {
        suite: 'copilot',
        caseLabel: 'harsh',
        trial: 1,
        judgePass: false,
        humanPass: true,
        humanCritique: '',
      },
    ]);
  });

  it('returns null ratios when a denominator is zero', () => {
    const report = computeAgreement([
      row({ judgePass: false, humanPass: false }),
    ]);
    expect(report.precision).toBeNull();
    expect(report.recall).toBeNull();
    expect(report.agreement).toBe(1);
    expect(computeAgreement([]).agreement).toBeNull();
  });
});

describe('formatReport', () => {
  it('renders counts, ratios, the small-sample warning, and disagreements', () => {
    const text = formatReport(
      computeAgreement([
        row({
          judgePass: true,
          humanPass: false,
          caseLabel: 'lenient',
          humanCritique: 'too soft',
        }),
        row({ judgePass: true, humanPass: true }),
      ])
    );
    expect(text).toContain('labeled: 2  unlabeled: 0');
    expect(text).toContain('precision: 50.0%');
    expect(text).toContain('recall: 100.0%');
    expect(text).toContain('~30');
    expect(text).toContain('lenient');
    expect(text).toContain('too soft');
  });

  it('renders n/a for null ratios and omits the warning at 30+ labels', () => {
    const rows = Array.from({ length: 30 }, () =>
      row({ judgePass: false, humanPass: false })
    );
    const text = formatReport(computeAgreement(rows));
    expect(text).toContain('precision: n/a');
    expect(text).not.toContain('~30');
  });
});
