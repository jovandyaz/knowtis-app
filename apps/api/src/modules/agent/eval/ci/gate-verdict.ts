import {
  caseVerdict,
  MIN_PASS_RATE_BY_CATEGORY,
  resolveEvalTrials,
  ungradedTrials,
  type CaseVerdict,
} from '../runtime/eval-runtime';
import { requiredEnv } from './cli-env';
import {
  describeSchemaError,
  evalSummarySchema,
  SUMMARY_READ_STATUS,
  type EvalSummaryCase,
  type SummaryRead,
} from './eval-summary';

export interface GateExpectation {
  readonly model: string;
  readonly trials: number;
}

export interface GateDecision {
  readonly verdict: CaseVerdict;
  /** Why the verdict is not a pass, one line per finding; empty on a pass. */
  readonly reasons: readonly string[];
}

interface SuiteFindings {
  readonly failed: readonly string[];
  readonly undecided: readonly string[];
}

const NO_SUMMARIES = 'no suite summaries to decide from';

/** The model and trial count the gate leg ran with: `AI_EVAL_MODEL` and `AI_EVAL_TRIALS`. */
export function gateExpectationFromEnv(): GateExpectation {
  return { model: requiredEnv('AI_EVAL_MODEL'), trials: resolveEvalTrials() };
}

const NO_FINDINGS: SuiteFindings = { failed: [], undecided: [] };

function caseFindings(
  suite: string,
  evalCase: EvalSummaryCase,
  suiteTrials: number
): SuiteFindings {
  const name = `${suite}: ${evalCase.label}`;
  const undecided = (reason: string): SuiteFindings => ({
    failed: [],
    undecided: [`${name} ${reason}`],
  });
  const { passes, trials, verdict } = evalCase;
  if (trials !== suiteTrials) {
    return undecided(`ran ${trials} of ${suiteTrials} trials`);
  }
  if (evalCase.category !== 'security') {
    return undecided('is not a security case');
  }
  if (verdict === undefined) {
    return undecided('has no verdict');
  }
  const ungraded = ungradedTrials(evalCase);
  if (
    passes + evalCase.graderErrors + evalCase.errors + evalCase.turnErrors >
    trials
  ) {
    return undecided(`counts more outcomes than its ${trials} trials`);
  }
  const recomputed = caseVerdict(
    { passes, failures: trials - passes - ungraded, ungraded },
    MIN_PASS_RATE_BY_CATEGORY.security
  );
  if (recomputed !== verdict) {
    return undecided(`says ${verdict} but its counts say ${recomputed}`);
  }
  const counts = `(${passes}/${trials})`;
  if (verdict === 'fail') {
    return { failed: [`${name} failed ${counts}`], undecided: [] };
  }
  return verdict === 'inconclusive'
    ? undecided(`inconclusive ${counts}`)
    : NO_FINDINGS;
}

function suiteFindings(
  suite: string,
  expected: GateExpectation,
  read: SummaryRead
): SuiteFindings {
  const undecided = (reason: string): SuiteFindings => ({
    failed: [],
    undecided: [`${suite}: ${reason}`],
  });
  if (read.status === SUMMARY_READ_STATUS.missing) {
    return undecided('no summary');
  }
  if (read.status === SUMMARY_READ_STATUS.unreadable) {
    return undecided(`unreadable summary (${read.reason})`);
  }
  const parsed = evalSummarySchema.safeParse(read.raw);
  if (!parsed.success) {
    return undecided(
      `malformed summary (${describeSchemaError(parsed.error)})`
    );
  }
  const summary = parsed.data;
  if (summary.model !== expected.model) {
    return undecided(`graded ${summary.model}, not ${expected.model}`);
  }
  if (summary.trials !== expected.trials) {
    return undecided(`ran ${summary.trials} trials, not ${expected.trials}`);
  }
  if (summary.cases.length === 0) {
    return undecided('no cases');
  }
  const perCase = summary.cases.map((evalCase) =>
    caseFindings(suite, evalCase, summary.trials)
  );
  return {
    failed: perCase.flatMap((findings) => findings.failed),
    undecided: perCase.flatMap((findings) => findings.undecided),
  };
}

/**
 * The model gate's verdict on the expected model and trial count from the
 * summaries its expected suites wrote. No case's recorded verdict is trusted
 * as is: each must be a security case whose verdict its own counts reproduce
 * under the security pass rate. A failed case is decided whatever its
 * ungraded trials were, so any failure fails the gate even beside a missing
 * or undecided suite. Otherwise no summary at all, a missing, unreadable,
 * malformed or foreign summary, one that ran another trial count, a suite
 * without cases, or a case that ran fewer trials than its suite, is not a
 * security case, counts more outcomes than trials, carries no verdict or one
 * its counts contradict, or is inconclusive makes it inconclusive; only then
 * does it pass.
 */
export function decideGateVerdict(
  expected: GateExpectation,
  reads: ReadonlyMap<string, SummaryRead>
): GateDecision {
  if (reads.size === 0) {
    return { verdict: 'inconclusive', reasons: [NO_SUMMARIES] };
  }
  const findings = [...reads].map(([suite, read]) =>
    suiteFindings(suite, expected, read)
  );
  const reasons = findings.flatMap(({ failed, undecided }) => [
    ...failed,
    ...undecided,
  ]);
  if (findings.some(({ failed }) => failed.length > 0)) {
    return { verdict: 'fail', reasons };
  }
  if (findings.some(({ undecided }) => undecided.length > 0)) {
    return { verdict: 'inconclusive', reasons };
  }
  return { verdict: 'pass', reasons: [] };
}
