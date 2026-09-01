import type { JudgmentRow } from './judgment-row';

export interface Disagreement {
  readonly suite: string;
  readonly caseLabel: string;
  readonly trial: number;
  readonly judgePass: boolean;
  readonly humanPass: boolean;
  readonly humanCritique: string;
}

export interface AgreementReport {
  readonly labeled: number;
  readonly unlabeled: number;
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  readonly trueNegatives: number;
  readonly precision: number | null;
  readonly recall: number | null;
  readonly agreement: number | null;
  readonly disagreements: readonly Disagreement[];
}

const CALIBRATION_SAMPLE_TARGET = 30;

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function computeAgreement(
  rows: readonly JudgmentRow[]
): AgreementReport {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let trueNegatives = 0;
  let unlabeled = 0;
  const disagreements: Disagreement[] = [];
  for (const row of rows) {
    if (row.humanPass === null) {
      unlabeled += 1;
      continue;
    }
    if (row.judgePass && row.humanPass) {
      truePositives += 1;
    } else if (row.judgePass && !row.humanPass) {
      falsePositives += 1;
    } else if (!row.judgePass && row.humanPass) {
      falseNegatives += 1;
    } else {
      trueNegatives += 1;
    }
    if (row.judgePass !== row.humanPass) {
      disagreements.push({
        suite: row.suite,
        caseLabel: row.caseLabel,
        trial: row.trial,
        judgePass: row.judgePass,
        humanPass: row.humanPass,
        humanCritique: row.humanCritique,
      });
    }
  }
  const labeled =
    truePositives + falsePositives + falseNegatives + trueNegatives;
  return {
    labeled,
    unlabeled,
    truePositives,
    falsePositives,
    falseNegatives,
    trueNegatives,
    precision: ratio(truePositives, truePositives + falsePositives),
    recall: ratio(truePositives, truePositives + falseNegatives),
    agreement: ratio(truePositives + trueNegatives, labeled),
    disagreements,
  };
}

export function formatReport(report: AgreementReport): string {
  const pct = (value: number | null): string =>
    value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
  const verdict = (pass: boolean): string => (pass ? 'pass' : 'fail');
  const lines = [
    `labeled: ${report.labeled}  unlabeled: ${report.unlabeled}`,
    `judge=pass human=pass (TP): ${report.truePositives}`,
    `judge=pass human=fail (FP): ${report.falsePositives}`,
    `judge=fail human=pass (FN): ${report.falseNegatives}`,
    `judge=fail human=fail (TN): ${report.trueNegatives}`,
    `precision: ${pct(report.precision)}  recall: ${pct(report.recall)}  agreement: ${pct(report.agreement)}`,
  ];
  if (report.labeled < CALIBRATION_SAMPLE_TARGET) {
    lines.push(
      `warning: only ${report.labeled} labeled rows; aim for ~${CALIBRATION_SAMPLE_TARGET} before trusting these numbers`
    );
  }
  for (const item of report.disagreements) {
    const critique = item.humanCritique ? ` — ${item.humanCritique}` : '';
    lines.push(
      `disagreement [${item.suite}] trial ${item.trial} judge=${verdict(item.judgePass)} human=${verdict(item.humanPass)}: ${item.caseLabel}${critique}`
    );
  }
  return lines.join('\n');
}
