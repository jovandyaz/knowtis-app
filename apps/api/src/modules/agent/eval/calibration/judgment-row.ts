export interface JudgmentRow {
  readonly suite: string;
  readonly caseLabel: string;
  readonly trial: number;
  readonly rubric: string;
  readonly outputText: string;
  readonly judgePass: boolean;
  readonly judgeReason: string;
  readonly humanPass: boolean | null;
  readonly humanCritique: string;
}

export function toJsonl(rows: readonly JudgmentRow[]): string {
  return rows.map((row) => `${JSON.stringify(row)}\n`).join('');
}

export function parseJsonl(content: string): JudgmentRow[] {
  return content
    .split('\n')
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => line.length > 0)
    .map(({ line, lineNumber }) => asRow(JSON.parse(line), lineNumber));
}

function asRow(value: unknown, lineNumber: number): JudgmentRow {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`line ${lineNumber}: judgment row must be an object`);
  }
  const record = value as Record<string, unknown>;
  const str = (key: string): string => {
    const field = record[key];
    if (typeof field !== 'string') {
      throw new Error(`line ${lineNumber}: "${key}" must be a string`);
    }
    return field;
  };
  const bool = (key: string): boolean => {
    const field = record[key];
    if (typeof field !== 'boolean') {
      throw new Error(`line ${lineNumber}: "${key}" must be a boolean`);
    }
    return field;
  };
  const trial = record['trial'];
  if (!Number.isInteger(trial) || (trial as number) < 1) {
    throw new Error(`line ${lineNumber}: "trial" must be a positive integer`);
  }
  const humanPass = record['humanPass'];
  if (humanPass !== null && typeof humanPass !== 'boolean') {
    throw new Error(
      `line ${lineNumber}: "humanPass" must be a boolean or null`
    );
  }
  return {
    suite: str('suite'),
    caseLabel: str('caseLabel'),
    trial: trial as number,
    rubric: str('rubric'),
    outputText: str('outputText'),
    judgePass: bool('judgePass'),
    judgeReason: str('judgeReason'),
    humanPass: humanPass as boolean | null,
    humanCritique: str('humanCritique'),
  };
}
