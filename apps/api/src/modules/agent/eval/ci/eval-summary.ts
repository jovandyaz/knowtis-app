import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import {
  CASE_VERDICTS,
  EVAL_CATEGORIES,
  summaryFileName,
} from '../runtime/eval-runtime';
import { messageOf } from './cli-env';

/** The promptfoo suites each eval target must leave a summary for. */
export const EVAL_TARGET_SUITES = {
  eval: ['copilot', 'injection-guard', 'memory-poisoning', 'transcript-replay'],
  'eval-security': ['copilot', 'injection-guard', 'memory-poisoning'],
} as const satisfies Record<string, readonly string[]>;

export type EvalTarget = keyof typeof EVAL_TARGET_SUITES;

export function isEvalTarget(value: string): value is EvalTarget {
  return Object.hasOwn(EVAL_TARGET_SUITES, value);
}

const evalSummaryCaseSchema = z.object({
  key: z.string(),
  label: z.string(),
  category: z.enum(EVAL_CATEGORIES).optional(),
  verdict: z.enum(CASE_VERDICTS).optional(),
  passes: z.int().nonnegative(),
  graderErrors: z.int().nonnegative().default(0),
  errors: z.int().nonnegative().default(0),
  turnErrors: z.int().nonnegative().default(0),
  trials: z.int().positive(),
});

/** A `<suite>.summary.json`. `category`, `verdict`, `errors` and `turnErrors` are absent from summaries written before verdicts existed. */
export const evalSummarySchema = z.object({
  suite: z.string(),
  model: z.string(),
  trials: z.int().positive(),
  cases: z.array(evalSummaryCaseSchema),
});

export type EvalSummary = z.infer<typeof evalSummarySchema>;
export type EvalSummaryCase = EvalSummary['cases'][number];

export const SUMMARY_READ_STATUS = {
  missing: 'missing',
  unreadable: 'unreadable',
  read: 'read',
} as const;

export type SummaryRead =
  | { readonly status: typeof SUMMARY_READ_STATUS.missing }
  | {
      readonly status: typeof SUMMARY_READ_STATUS.unreadable;
      readonly reason: string;
    }
  | { readonly status: typeof SUMMARY_READ_STATUS.read; readonly raw: unknown };

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function readSummary(path: string): Promise<SummaryRead> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    return isMissingFile(error)
      ? { status: SUMMARY_READ_STATUS.missing }
      : { status: SUMMARY_READ_STATUS.unreadable, reason: messageOf(error) };
  }
  try {
    return { status: SUMMARY_READ_STATUS.read, raw: JSON.parse(text) };
  } catch (error) {
    return { status: SUMMARY_READ_STATUS.unreadable, reason: messageOf(error) };
  }
}

export async function readSuiteSummaries(
  dir: string,
  suites: readonly string[]
): Promise<Map<string, SummaryRead>> {
  const entries = await Promise.all(
    suites.map(
      async (suite) =>
        [suite, await readSummary(join(dir, summaryFileName(suite)))] as const
    )
  );
  return new Map(entries);
}

export function describeSchemaError(error: z.ZodError): string {
  const [issue] = error.issues;
  return issue
    ? `${issue.path.join('.') || '(root)'}: ${issue.message}`
    : error.message;
}
