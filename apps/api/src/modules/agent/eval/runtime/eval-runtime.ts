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
  readonly graderErrors: number;
  readonly trials: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Summed over trials; null when any trial ran without known pricing. */
  readonly costUsd: number | null;
}

export interface EvalTrialUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface EvalTrialResult {
  readonly success: boolean;
  readonly vars?: Record<string, unknown>;
  /** The rubric grader could not be reached, so the trial carries no verdict. */
  readonly errored?: boolean;
  readonly usage?: EvalTrialUsage;
  readonly costUsd?: number | null;
}

type PromptfooTrial = Pick<
  EvaluateResult,
  'success' | 'vars' | 'gradingResult' | 'response'
>;

// The provider returns the transcript object, but promptfoo persists results
// and may hand the output back as its JSON string.
function readTranscriptUsage(
  output: unknown
): Pick<EvalTrialResult, 'usage' | 'costUsd'> {
  let parsed: unknown = output;
  if (typeof output === 'string') {
    try {
      parsed = JSON.parse(output);
    } catch {
      return {};
    }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return {};
  }
  const { usage, costUsd } = parsed as {
    usage?: unknown;
    costUsd?: unknown;
  };
  if (
    typeof usage !== 'object' ||
    usage === null ||
    typeof (usage as { inputTokens?: unknown }).inputTokens !== 'number' ||
    typeof (usage as { outputTokens?: unknown }).outputTokens !== 'number'
  ) {
    return {};
  }
  const { inputTokens, outputTokens } = usage as EvalTrialUsage;
  return {
    usage: { inputTokens, outputTokens },
    costUsd: typeof costUsd === 'number' ? costUsd : null,
  };
}

/**
 * Grader transport errors (e.g. HTTP 529 from the rubric model) reach promptfoo
 * as failed assertions tagged `metadata.graderError`, not as errored trials.
 * A trial only counts as errored when every failing assertion is one of those;
 * a real assertion failure in the same trial is still behavioral signal.
 *
 * A trial promptfoo reports as errored is not one of these: `callApi` does not
 * catch, so excusing those would drop the `assertPinnedModelServed` throws that
 * catch the fallback chain grading the wrong model.
 */
export function toTrialResult(result: PromptfooTrial): EvalTrialResult {
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
    errored: !result.success && onlyGraderErrors,
    ...readTranscriptUsage(result.response?.output),
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
  const byCase = new Map<string, Omit<EvalCaseOutcome, 'key'>>();
  for (const result of results) {
    const key = caseKeyOf(result.vars);
    const label = (result.vars?.['message'] as string | undefined) ?? '(case)';
    const entry = byCase.get(key) ?? {
      label,
      passes: 0,
      graderErrors: 0,
      trials: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    const costUsd =
      entry.costUsd === null || typeof result.costUsd !== 'number'
        ? null
        : entry.costUsd + result.costUsd;
    byCase.set(key, {
      ...entry,
      trials: entry.trials + 1,
      passes: entry.passes + (result.success ? 1 : 0),
      graderErrors:
        entry.graderErrors + (!result.success && result.errored ? 1 : 0),
      inputTokens: entry.inputTokens + (result.usage?.inputTokens ?? 0),
      outputTokens: entry.outputTokens + (result.usage?.outputTokens ?? 0),
      costUsd,
    });
  }
  const cases = [...byCase.entries()].map(([key, entry]) => ({
    key,
    ...entry,
  }));
  const casesBelowThreshold = cases.filter((c) => {
    const gradedTrials = c.trials - c.graderErrors;
    return (
      gradedTrials === 0 || c.passes < Math.ceil(minPassRate * gradedTrials)
    );
  });
  return { cases, casesBelowThreshold };
}

export function formatCaseOutcome(
  outcome: EvalCaseOutcome,
  casesBelowThreshold: readonly EvalCaseOutcome[]
): string {
  const status = casesBelowThreshold.includes(outcome) ? 'FAIL' : 'PASS';
  const gradedTrials = outcome.trials - outcome.graderErrors;
  const verdict =
    outcome.graderErrors === 0
      ? `${status} ${outcome.passes}/${outcome.trials}`
      : `${status} ${outcome.passes}/${gradedTrials} graded, ${outcome.graderErrors} of ${outcome.trials} ungraded`;
  const cost =
    outcome.costUsd === null ? '' : ` · $${outcome.costUsd.toFixed(4)}`;
  return `${verdict} · ${outcome.inputTokens}/${outcome.outputTokens} tok${cost}`;
}

export interface EvalRunStats {
  readonly successes: number;
  readonly failures: number;
  readonly providerErrors: number;
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
  const { default: promptfoo } = await import('promptfoo');
  const record = await promptfoo.evaluate(
    suite as Parameters<typeof promptfoo.evaluate>[0],
    { maxConcurrency: 1, repeat: trials }
  );
  const summary = await record.toEvaluateSummary();

  const { cases, casesBelowThreshold } = summarizeTrials(
    summary.results.map(toTrialResult),
    options.minPassRate
  );
  const graderErrors = cases.reduce((n, c) => n + c.graderErrors, 0);

  /* eslint-disable no-console */
  for (const evalCase of cases) {
    console.log(
      `[${formatCaseOutcome(evalCase, casesBelowThreshold)}] ${evalCase.label}`
    );
  }
  console.log(
    `\nTrials passed: ${summary.stats.successes}  Failed: ${summary.stats.failures} (${graderErrors} ungraded)  Provider errors: ${summary.stats.errors}  Cases below threshold: ${casesBelowThreshold.length}`
  );
  /* eslint-enable no-console */

  return {
    successes: summary.stats.successes,
    failures: summary.stats.failures,
    providerErrors: summary.stats.errors,
    cases,
    casesBelowThreshold,
  };
}
