import { caseKeyOf } from '../runtime/eval-runtime';
import type { JudgmentRow } from './judgment-row';

interface NativeGradingResult {
  readonly pass?: boolean;
  readonly reason?: string;
  readonly componentResults?: readonly NativeGradingResult[];
  readonly assertion?: {
    readonly type?: string;
    readonly value?: unknown;
  } | null;
}

interface NativeResult {
  readonly vars?: Record<string, unknown>;
  readonly response?: { readonly output?: unknown };
  readonly gradingResult?: NativeGradingResult | null;
}

interface NativeOutputFile {
  readonly results?: { readonly results?: readonly NativeResult[] };
}

function rubricComponents(
  grading: NativeGradingResult | null | undefined
): readonly NativeGradingResult[] {
  if (!grading) {
    return [];
  }
  const components = grading.componentResults?.length
    ? grading.componentResults
    : [grading];
  return components.filter(
    (component) => component.assertion?.type === 'llm-rubric'
  );
}

function outputTextOf(output: unknown): string {
  if (typeof output === 'string') {
    try {
      const parsed: unknown = JSON.parse(output);
      return typeof parsed === 'object' && parsed !== null
        ? outputTextOf(parsed)
        : output;
    } catch {
      return output;
    }
  }
  if (
    typeof output === 'object' &&
    output !== null &&
    typeof (output as { text?: unknown }).text === 'string'
  ) {
    return (output as { text: string }).text;
  }
  return JSON.stringify(output ?? null);
}

export function extractJudgments(file: unknown, suite: string): JudgmentRow[] {
  const results = (file as NativeOutputFile).results?.results ?? [];
  const trialsSeen = new Map<string, number>();
  const rows: JudgmentRow[] = [];
  for (const result of results) {
    const key = caseKeyOf(result.vars);
    const trial = (trialsSeen.get(key) ?? 0) + 1;
    trialsSeen.set(key, trial);
    for (const component of rubricComponents(result.gradingResult)) {
      rows.push({
        suite,
        caseLabel: String(result.vars?.['message'] ?? '(case)'),
        trial,
        rubric:
          typeof component.assertion?.value === 'string'
            ? component.assertion.value
            : JSON.stringify(component.assertion?.value ?? null),
        outputText: outputTextOf(result.response?.output),
        judgePass: component.pass === true,
        judgeReason: component.reason ?? '',
        humanPass: null,
        humanCritique: '',
      });
    }
  }
  return rows;
}
