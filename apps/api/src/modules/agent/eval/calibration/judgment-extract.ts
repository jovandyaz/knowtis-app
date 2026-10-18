import { z } from 'zod';

import { caseKeyOf, caseLabelOf } from '../runtime/eval-runtime';
import type { JudgmentRow } from './judgment-row';

interface NativeGradingResult {
  readonly pass?: boolean;
  readonly reason?: string;
  readonly componentResults?: readonly NativeGradingResult[];
  readonly assertion?: {
    readonly type?: string;
    readonly value?: unknown;
  } | null;
  readonly metadata?: {
    readonly graderError?: boolean;
    readonly renderedGradingPrompt?: unknown;
  } | null;
}

interface NativeResult {
  readonly vars?: Record<string, unknown>;
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
    (component) =>
      component.assertion?.type === 'llm-rubric' &&
      component.metadata?.graderError !== true
  );
}

const JUDGED_OUTPUT_OPEN = '<Output>\n';
const JUDGED_OUTPUT_CLOSE = '\n</Output>\n<Rubric>\n';

const gradingMessagesSchema = z.array(
  z.object({ role: z.string(), content: z.string() })
);

function judgeInputOf(renderedPrompt: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(renderedPrompt);
  } catch {
    return renderedPrompt;
  }
  const messages = gradingMessagesSchema.safeParse(parsed);
  return messages.success
    ? (messages.data.findLast((message) => message.role === 'user')?.content ??
        renderedPrompt)
    : renderedPrompt;
}

function judgedOutputOf(component: NativeGradingResult): string {
  const rendered = component.metadata?.renderedGradingPrompt;
  if (typeof rendered !== 'string') {
    throw new Error(
      'an llm-rubric judgment has no recorded grading input (metadata.renderedGradingPrompt)'
    );
  }
  const input = judgeInputOf(rendered);
  const end = input.lastIndexOf(JUDGED_OUTPUT_CLOSE);
  return input.startsWith(JUDGED_OUTPUT_OPEN) &&
    end >= JUDGED_OUTPUT_OPEN.length
    ? input.slice(JUDGED_OUTPUT_OPEN.length, end)
    : input;
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
        caseLabel: caseLabelOf(result.vars),
        trial,
        rubric:
          typeof component.assertion?.value === 'string'
            ? component.assertion.value
            : JSON.stringify(component.assertion?.value ?? null),
        outputText: judgedOutputOf(component),
        judgePass: component.pass === true,
        judgeReason: component.reason ?? '',
        humanPass: null,
        humanCritique: '',
      });
    }
  }
  return rows;
}
