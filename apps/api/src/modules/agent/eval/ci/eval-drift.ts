import { z } from 'zod';

import { ungradedTrials, type CaseVerdict } from '../runtime/eval-runtime';
import { messageOf } from './cli-env';
import {
  describeSchemaError,
  EVAL_TARGET_SUITES,
  evalSummarySchema,
  SUMMARY_READ_STATUS,
  type EvalSummary,
  type EvalSummaryCase,
  type EvalTarget,
  type SummaryRead,
} from './eval-summary';

export interface Baseline {
  readonly runId: string;
  readonly summary: EvalSummary;
}

export type RunLoader = (
  runId: string
) => Promise<ReadonlyMap<string, SummaryRead>>;

export interface BaselineSearch {
  readonly baselines: ReadonlyMap<string, Baseline>;
  readonly errors: readonly string[];
}

export interface DriftReportInput {
  readonly target: EvalTarget;
  readonly current: ReadonlyMap<string, SummaryRead>;
  readonly baselines: ReadonlyMap<string, Baseline>;
  readonly lookback: number;
  readonly branch: string;
  readonly errors: readonly string[];
}

const runListSchema = z.array(z.object({ databaseId: z.int() }));

const artifactListingSchema = z.object({
  artifacts: z.array(z.object({ name: z.string(), expired: z.boolean() })),
});

/** The two-sided p-value below which a paired verdict regression is not read as variance. */
export const DRIFT_SIGNIFICANCE_ALPHA = 0.05;

const BINOMIAL_NULL_PROBABILITY = 0.5;
const P_VALUE_DIGITS = 3;

const MARKDOWN_SPECIAL = /[\\`*_[\]<>|#~]/g;
const LINE_BREAK = /\r?\n/g;

/** A summary that can anchor a comparison: at least one case, and every case graded every trial of the run. */
export function isCompleteSummary(summary: EvalSummary): boolean {
  return (
    summary.cases.length > 0 &&
    summary.cases.every(
      (evalCase) =>
        evalCase.trials === summary.trials &&
        ungradedTrials(evalCase) === 0 &&
        evalCase.verdict !== 'inconclusive'
    )
  );
}

function completeSummaryOf(read: SummaryRead | undefined): EvalSummary | null {
  if (read?.status !== SUMMARY_READ_STATUS.read) {
    return null;
  }
  const parsed = evalSummarySchema.safeParse(read.raw);
  return parsed.success && isCompleteSummary(parsed.data) ? parsed.data : null;
}

/** For each suite, the newest of `runIds` whose summary of it is complete. Loads runs newest first and stops once every suite has a baseline; a run that fails to load is reported and skipped. */
export async function findBaselines(
  suites: readonly string[],
  runIds: readonly string[],
  loadRun: RunLoader
): Promise<BaselineSearch> {
  const baselines = new Map<string, Baseline>();
  const errors: string[] = [];
  for (const runId of runIds) {
    if (suites.every((suite) => baselines.has(suite))) {
      break;
    }
    let reads: ReadonlyMap<string, SummaryRead>;
    try {
      reads = await loadRun(runId);
    } catch (error) {
      errors.push(`run ${runId}: ${messageOf(error)}`);
      continue;
    }
    for (const suite of suites) {
      const summary = baselines.has(suite)
        ? null
        : completeSummaryOf(reads.get(suite));
      if (summary) {
        baselines.set(suite, { runId, summary });
      }
    }
  }
  return { baselines, errors };
}

/** The run ids of `gh run list --json databaseId` output, newest first, without `currentRunId`. */
export function candidateRunIds(
  listing: unknown,
  currentRunId: string
): string[] {
  const parsed = runListSchema.safeParse(listing);
  if (!parsed.success) {
    throw new Error(
      `unexpected run list: ${describeSchemaError(parsed.error)}`
    );
  }
  return parsed.data
    .map(({ databaseId }) => String(databaseId))
    .filter((runId) => runId !== currentRunId);
}

/** Whether a run's artifact listing holds an unexpired artifact named `name`. */
export function hasLiveArtifact(listing: unknown, name: string): boolean {
  const parsed = artifactListingSchema.safeParse(listing);
  if (!parsed.success) {
    throw new Error(
      `unexpected artifact listing: ${describeSchemaError(parsed.error)}`
    );
  }
  return parsed.data.artifacts.some(
    (artifact) => artifact.name === name && !artifact.expired
  );
}

export function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_SPECIAL, '\\$&').replace(LINE_BREAK, ' ');
}

function gradedOf(evalCase: EvalSummaryCase): number {
  return evalCase.trials - ungradedTrials(evalCase);
}

function passRate(evalCase: EvalSummaryCase): number | null {
  const graded = gradedOf(evalCase);
  return graded === 0 ? null : evalCase.passes / graded;
}

function passCell(evalCase: EvalSummaryCase): string {
  const graded = gradedOf(evalCase);
  return graded === 0 ? '-/0' : `${evalCase.passes}/${graded}`;
}

export const DRIFT_STATUSES = [
  'new',
  'ungraded',
  'regraded',
  'REGRESSED',
  'improved',
  '=',
] as const;
export type DriftStatus = (typeof DRIFT_STATUSES)[number];

function driftStatus(
  current: EvalSummaryCase,
  previous: EvalSummaryCase | undefined
): DriftStatus {
  if (!previous) {
    return 'new';
  }
  const now = passRate(current);
  const before = passRate(previous);
  if (now === null) {
    return 'ungraded';
  }
  if (before === null) {
    return 'regraded';
  }
  if (now < before) {
    return 'REGRESSED';
  }
  return now > before ? 'improved' : '=';
}

function caseRow(
  current: EvalSummaryCase,
  previous: EvalSummaryCase | undefined
): string {
  const cells = [
    escapeMarkdown(current.label),
    previous ? passCell(previous) : '-',
    passCell(current),
    `${ungradedTrials(current)}/${current.trials}`,
    current.verdict?.toUpperCase() ?? '-',
    driftStatus(current, previous),
  ];
  return `| ${cells.join(' | ')} |`;
}

function isComparable(previous: EvalSummary, current: EvalSummary): boolean {
  return previous.model === current.model && previous.trials === current.trials;
}

/** The exact two-sided McNemar test: the binomial tail of the rarer flip over `b + c` discordant pairs at 0.5, doubled and capped at 1. */
export function mcnemarExactP(b: number, c: number): number {
  const discordant = b + c;
  let term = BINOMIAL_NULL_PROBABILITY ** discordant;
  let tail = 0;
  for (let flips = 0; flips <= Math.min(b, c); flips += 1) {
    tail += term;
    term *= (discordant - flips) / (flips + 1);
  }
  return Math.min(1, 2 * tail);
}

/** This run against its baselines, pooled over every suite that has a comparable one. */
export interface PairedDrift {
  /** Cases present in both runs with graded trials in both, and no turn that ended unanswered in this run: an outage is not a regression. */
  readonly pairs: number;
  /** `b`: pairs whose verdict went from pass to fail. */
  readonly regressed: number;
  /** `c`: pairs whose verdict went from fail to pass. */
  readonly recovered: number;
  readonly pValue: number;
}

function casePairs(
  read: SummaryRead,
  baseline: Baseline | undefined
): (readonly [EvalSummaryCase, EvalSummaryCase])[] {
  if (read.status !== SUMMARY_READ_STATUS.read || !baseline) {
    return [];
  }
  const parsed = evalSummarySchema.safeParse(read.raw);
  if (!parsed.success || !isComparable(baseline.summary, parsed.data)) {
    return [];
  }
  const previousByKey = new Map(baseline.summary.cases.map((c) => [c.key, c]));
  return parsed.data.cases.flatMap((current) => {
    const previous = previousByKey.get(current.key);
    return previous &&
      gradedOf(previous) > 0 &&
      gradedOf(current) > 0 &&
      current.turnErrors === 0
      ? [[previous, current] as const]
      : [];
  });
}

/** The paired comparison of `current` with `baselines`. A summary that cannot be read, has no baseline or an incomparable one adds no pair. */
export function pairedDrift(
  current: ReadonlyMap<string, SummaryRead>,
  baselines: ReadonlyMap<string, Baseline>
): PairedDrift {
  const pairs = [...current].flatMap(([suite, read]) =>
    casePairs(read, baselines.get(suite))
  );
  const flipped = (from: CaseVerdict, to: CaseVerdict) =>
    pairs.filter(
      ([previous, now]) => previous.verdict === from && now.verdict === to
    ).length;
  const regressed = flipped('pass', 'fail');
  const recovered = flipped('fail', 'pass');
  return {
    pairs: pairs.length,
    regressed,
    recovered,
    pValue: mcnemarExactP(regressed, recovered),
  };
}

/** More verdicts regressed than recovered, beyond what chance explains. */
export function isSignificantRegression(drift: PairedDrift): boolean {
  return (
    drift.regressed > drift.recovered && drift.pValue < DRIFT_SIGNIFICANCE_ALPHA
  );
}

function pairedDriftLines(drift: PairedDrift): string[] {
  if (drift.pairs === 0) {
    return ['Paired verdicts: no case pairs with a baseline.'];
  }
  return [
    `Paired verdicts: ${drift.regressed} pass -> fail, ${drift.recovered} fail -> pass over ${drift.pairs} cases, exact McNemar p = ${drift.pValue.toFixed(P_VALUE_DIGITS)}.`,
    ...(isSignificantRegression(drift)
      ? ['Significant regression: this leg fails.']
      : []),
  ];
}

function isMissing(read: SummaryRead | undefined): boolean {
  return (
    (read?.status ?? SUMMARY_READ_STATUS.missing) ===
    SUMMARY_READ_STATUS.missing
  );
}

function suiteSection(
  suite: string,
  read: SummaryRead,
  baseline: Baseline | undefined,
  lookback: number,
  branch: string
): string[] {
  if (read.status === SUMMARY_READ_STATUS.missing) {
    return [];
  }
  if (read.status === SUMMARY_READ_STATUS.unreadable) {
    return [
      `### ${suite}: unreadable summary (${escapeMarkdown(read.reason)}).`,
    ];
  }
  const parsed = evalSummarySchema.safeParse(read.raw);
  if (!parsed.success) {
    return [
      `### ${suite}: malformed summary (${escapeMarkdown(describeSchemaError(parsed.error))}).`,
    ];
  }
  const current = parsed.data;
  if (!baseline) {
    return [
      `### ${suite}: no complete baseline in the last ${lookback} ${branch} runs.`,
    ];
  }
  const previous = baseline.summary;
  if (!isComparable(previous, current)) {
    return [
      `### ${suite}: baseline run ${baseline.runId} is not comparable (model ${escapeMarkdown(previous.model)} -> ${escapeMarkdown(current.model)}, trials ${previous.trials} -> ${current.trials}).`,
    ];
  }
  const previousByKey = new Map(previous.cases.map((c) => [c.key, c]));
  const currentKeys = new Set(current.cases.map((c) => c.key));
  const removed = previous.cases
    .filter((c) => !currentKeys.has(c.key))
    .map((c) => escapeMarkdown(c.label));
  return [
    `### ${suite} vs run ${baseline.runId} (${escapeMarkdown(current.model)}, ${current.trials} trials)`,
    '',
    '| Case | Baseline | Current | Ungraded | Verdict | Status |',
    '| --- | --- | --- | --- | --- | --- |',
    ...current.cases.map((c) => caseRow(c, previousByKey.get(c.key))),
    ...(removed.length > 0 ? ['', `Removed cases: ${removed.join(', ')}`] : []),
  ];
}

/** The job-summary Markdown comparing each suite of this run with its baseline, then the paired verdict test over them. Every interpolated label, model and reason is escaped. */
export function renderDriftReport(input: DriftReportInput): string {
  const { target, current, baselines, lookback, branch, errors } = input;
  const missing = EVAL_TARGET_SUITES[target].filter((suite) =>
    isMissing(current.get(suite))
  );
  const blocks: string[][] = [[`## Eval drift vs earlier ${branch} runs`]];
  if (errors.length > 0) {
    blocks.push([
      'Errors while looking for baselines:',
      ...errors.map((error) => `- ${escapeMarkdown(error)}`),
    ]);
  }
  if (missing.length > 0) {
    blocks.push([
      `Missing suites: ${missing.join(', ')} (expected from ${target}).`,
    ]);
  }
  for (const [suite, read] of current) {
    const section = suiteSection(
      suite,
      read,
      baselines.get(suite),
      lookback,
      branch
    );
    if (section.length > 0) {
      blocks.push(section);
    }
  }
  blocks.push(pairedDriftLines(pairedDrift(current, baselines)));
  return `${blocks.map((block) => block.join('\n')).join('\n\n')}\n`;
}
