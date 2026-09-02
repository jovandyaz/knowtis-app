import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type {
  ApiProvider,
  Assertion,
  CallApiContextParams,
  EvaluateResult,
  ProviderResponse,
} from 'promptfoo';

export interface EvalSuiteConfig {
  readonly providers: ApiProvider[];
  readonly prompts: string[];
  readonly tests: Array<{
    readonly description?: string;
    readonly vars: Record<string, unknown>;
    readonly assert: Assertion[];
  }>;
  readonly defaultTest?: { readonly options?: { readonly provider?: string } };
  readonly outputPath?: string;
}

export function createStructuredProvider<TVars, TOut>(
  id: string,
  run: (vars: TVars) => Promise<TOut>
): ApiProvider {
  return {
    id: () => id,
    callApi: async (
      _prompt: string,
      context?: CallApiContextParams
    ): Promise<ProviderResponse> => {
      const vars = (context?.vars ?? {}) as TVars;
      const output = await run(vars);
      return { output: output as ProviderResponse['output'] };
    },
  };
}

export function resolveEvalModel(envVar: string, fallback: string): string {
  const value = process.env[envVar];
  return value && value.trim() ? value.trim() : fallback;
}

export function resolveEvalTrials(): number {
  const parsed = Number.parseInt(process.env['AI_EVAL_TRIALS'] ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export interface EvalOutputTarget {
  readonly dir: string;
  readonly nativePath: string;
  readonly summaryPath: string;
}

export async function prepareEvalOutput(
  suiteName: string
): Promise<EvalOutputTarget | null> {
  const raw = process.env['AI_EVAL_OUTPUT_DIR'];
  if (!raw || !raw.trim()) {
    return null;
  }
  const dir = resolve(raw.trim());
  await mkdir(dir, { recursive: true });
  return {
    dir,
    nativePath: join(dir, `${suiteName}.json`),
    summaryPath: join(dir, `${suiteName}.summary.json`),
  };
}

export async function writeEvalSummary(
  target: EvalOutputTarget,
  meta: { suite: string; model: string; trials: number },
  stats: EvalRunStats
): Promise<void> {
  const payload = {
    suite: meta.suite,
    model: meta.model,
    trials: meta.trials,
    gitSha: process.env['GITHUB_SHA'] ?? null,
    timestamp: new Date().toISOString(),
    cases: stats.cases,
  };
  await writeFile(
    target.summaryPath,
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8'
  );
}

export function evalGateOpen(): boolean {
  const key = process.env['ANTHROPIC_API_KEY'];
  if (!key || !key.trim()) {
    // eslint-disable-next-line no-console
    console.log('eval skipped: ANTHROPIC_API_KEY not set');
    return false;
  }
  return true;
}

export const EVAL_MIN_PASS_RATE = 2 / 3;

export interface EvalCaseOutcome {
  readonly key: string;
  readonly label: string;
  readonly passes: number;
  readonly errors: number;
  readonly trials: number;
}

export interface EvalTrialResult {
  readonly success: boolean;
  readonly vars?: Record<string, unknown>;
  /** Infrastructure failure (provider/grader transport), not a behavioral one. */
  readonly errored?: boolean;
}

type PromptfooTrial = Pick<
  EvaluateResult,
  'success' | 'vars' | 'failureReason' | 'gradingResult'
>;

/**
 * Grader transport errors (e.g. HTTP 529 from the rubric model) reach promptfoo
 * as failed assertions tagged `metadata.graderError`, not as errored trials.
 * A trial only counts as errored when every failing assertion is one of those;
 * a real assertion failure in the same trial is still behavioral signal.
 */
export function toTrialResult(
  result: PromptfooTrial,
  errorReason: number
): EvalTrialResult {
  const failedComponents = (
    result.gradingResult?.componentResults ?? []
  ).filter((component) => !component.pass);
  const onlyGraderErrors =
    failedComponents.length > 0 &&
    failedComponents.every(
      (component) => component.metadata?.graderError === true
    );
  return {
    success: result.success,
    vars: result.vars,
    errored:
      !result.success &&
      (result.failureReason === errorReason || onlyGraderErrors),
  };
}

export interface EvalTrialSummary {
  readonly cases: readonly EvalCaseOutcome[];
  readonly casesBelowThreshold: readonly EvalCaseOutcome[];
}

// promptfoo assigns a fresh testIdx to every repeat, so trials of one case are
// grouped by their vars identity instead (unique per case in every suite; the
// suites assert cases.length, which catches an accidental vars collision).
export function caseKeyOf(vars: Record<string, unknown> | undefined): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(vars ?? {}).sort(([a], [b]) => a.localeCompare(b))
    )
  );
}

export function summarizeTrials(
  results: readonly EvalTrialResult[],
  minPassRate: number = EVAL_MIN_PASS_RATE
): EvalTrialSummary {
  const byCase = new Map<
    string,
    { label: string; passes: number; errors: number; trials: number }
  >();
  for (const result of results) {
    const key = caseKeyOf(result.vars);
    const label = (result.vars?.['message'] as string | undefined) ?? '(case)';
    const entry = byCase.get(key) ?? {
      label,
      passes: 0,
      errors: 0,
      trials: 0,
    };
    entry.trials += 1;
    if (result.success) {
      entry.passes += 1;
    } else if (result.errored) {
      entry.errors += 1;
    }
    byCase.set(key, entry);
  }
  const cases = [...byCase.entries()].map(([key, entry]) => ({
    key,
    ...entry,
  }));
  // Errored trials carry no behavioral signal, so the pass rate is judged over
  // the valid ones — but never let an all-errored case pass as green.
  const casesBelowThreshold = cases.filter((c) => {
    const validTrials = c.trials - c.errors;
    return validTrials === 0 || c.passes < Math.ceil(minPassRate * validTrials);
  });
  return { cases, casesBelowThreshold };
}

export interface EvalRunStats {
  readonly successes: number;
  readonly failures: number;
  readonly errors: number;
  readonly cases: readonly EvalCaseOutcome[];
  readonly casesBelowThreshold: readonly EvalCaseOutcome[];
}

export interface EvalRunOptions {
  readonly trials?: number;
  readonly minPassRate?: number;
}

export async function runEvalSuite(
  suite: EvalSuiteConfig,
  options: EvalRunOptions = {}
): Promise<EvalRunStats> {
  const trials = options.trials ?? 1;
  const { default: promptfoo, ResultFailureReason } = await import('promptfoo');
  const record = await promptfoo.evaluate(
    suite as Parameters<typeof promptfoo.evaluate>[0],
    { maxConcurrency: 1, repeat: trials }
  );
  const summary = await record.toEvaluateSummary();

  const { cases, casesBelowThreshold } = summarizeTrials(
    summary.results.map((result) =>
      toTrialResult(result, ResultFailureReason.ERROR)
    ),
    options.minPassRate
  );

  /* eslint-disable no-console */
  for (const evalCase of cases) {
    const status = casesBelowThreshold.includes(evalCase) ? 'FAIL' : 'PASS';
    const errors = evalCase.errors > 0 ? ` (${evalCase.errors} errored)` : '';
    console.log(
      `[${status} ${evalCase.passes}/${evalCase.trials}${errors}] ${evalCase.label}`
    );
  }
  console.log(
    `\nTrials passed: ${summary.stats.successes}  Failed: ${summary.stats.failures}  Errors: ${summary.stats.errors}  Cases below threshold: ${casesBelowThreshold.length}`
  );
  /* eslint-enable no-console */

  return {
    successes: summary.stats.successes,
    failures: summary.stats.failures,
    errors: summary.stats.errors,
    cases,
    casesBelowThreshold,
  };
}
