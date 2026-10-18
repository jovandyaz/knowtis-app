import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PLATFORM_SELECTOR_KEYS } from '@knowtis/shared-types';

import { PLATFORM_SEED_MODELS } from '../../ai/domain/model-catalog/platform-resolution';
import { EVAL_TARGET_SUITES } from './ci/eval-summary';
import type { CaseVerdict } from './runtime/eval-runtime';
import {
  jobSection,
  jqTestPatterns,
  readWorkflow,
  REPO_ROOT,
  runScripts,
} from './workflow-text';

const WORKFLOW = readWorkflow('model-gate.yml');
const PROJECT = readFileSync(join(REPO_ROOT, 'apps/api/project.json'), 'utf8');
const WEEKLY = readWorkflow('nightly-eval.yml');
const PENDING = jobSection(WORKFLOW, 'pending');
const GATE = jobSection(WORKFLOW, 'gate');
const SECURITY_TRIALS = 10;
const THROWAWAY_ENV = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'TOKEN_HASH_KEY',
] as const;
const EVAL_SECURITY_RUN_RE = /^ +run: npx nx run api:eval-security$/m;
const TRIALS_RE = new RegExp(`^ +AI_EVAL_TRIALS: ${SECURITY_TRIALS}$`, 'm');
const EVAL_STEP = '- id: eval';
const EVALUATED_MODEL_RE = /^ +AI_EVAL_MODEL: \$\{\{ matrix\.modelId \}\}$/m;
const JUDGED_MODEL_RE = /^ +MODEL_ID: \$\{\{ matrix\.modelId \}\}$/m;
const DECIDE_STEP = '- id: verdict';
const POST_STEP = '- name: Post the verdict';
const DECIDE_CONDITION_RE =
  /^ +- id: verdict\n +name: .+\n +if: \$\{\{ !cancelled\(\) && \((.+)\) \}\}$/m;
const POST_CONDITION_RE =
  /^ +- name: Post the verdict\n +if: \$\{\{ !cancelled\(\) && \((.+)\) \}\}$/m;
const DECIDE_RUN_RE = /^ +run: npx nx run api:eval-gate-verdict$/m;
const EVAL_OUTCOME_TERM_RE = /^steps\.eval\.outcome == '(\w+)'$/;
const EVAL_RAN_OUTCOMES = ['success', 'failure'];
const FAIL: CaseVerdict = 'fail';
const PASS: CaseVerdict = 'pass';
const POSTED_WHEN = `steps.verdict.outputs.verdict == '${FAIL}' || (steps.verdict.outputs.verdict == '${PASS}' && steps.eval.outcome == 'success')`;
const PASSED_RE =
  /^ +PASSED: \$\{\{ steps\.verdict\.outputs\.verdict == 'pass' \}\}$/m;
const SECURITY_TARGET_FILES_RE =
  /"eval-security": \{[^}]*?"command": "pnpm exec vitest run --config vitest\.eval\.config\.ts ([^"]+)"/s;
const SUITE_FILE_RE = /^src\/modules\/agent\/eval\/([\w-]+)\.eval\.ts$/;
const GRADER_KEY_CHECK = 'if [ -z "$ANTHROPIC_API_KEY" ]; then';
const UNSET_SECRETS_EXIT_RE =
  /if \[ -z "\$KNOWTIS_API_URL" \] \|\| \[ -z "\$MODEL_GATE_TOKEN" \]; then\n +echo "::notice::.+"\n +echo 'matrix=\[\]' >> "\$GITHUB_OUTPUT"\n +exit 0\n +fi/;
const GATE_SKIPS_EMPTY_MATRIX_RE =
  /^ {4}if: \$\{\{ needs\.pending\.outputs\.matrix != '\[\]' \}\}$/m;
const EXPRESSION_OPEN = '${{';
const VALIDATED_FIELDS_ONLY_RE =
  /^ +matrix=\$\(jq -c '.+ \| map\(\{selectorKey, modelId\}\)' <<<"\$body"\)$/m;
const ONE_LEG_AT_A_TIME_RE =
  /^ +strategy:\n +fail-fast: false\n(?: +#.*\n)? +max-parallel: 1$/m;
const UNKNOWN_SELECTOR = 'platform.other';
const ALIAS_PIN = 'openrouter:~anthropic/claude-sonnet-latest';
const TRAILING_NEWLINE = '\n';

function pendingEntryPatterns(): { selectorKey: RegExp; modelId: RegExp } {
  const [script = ''] = runScripts(PENDING);
  const [selectorKey, modelId] = jqTestPatterns(script);
  if (!selectorKey || !modelId) {
    throw new Error('the pending job validates no selector key or model id');
  }
  return { selectorKey, modelId };
}

function conditionTerms(stepCondition: RegExp): string[] {
  const [, condition = ''] = GATE.match(stepCondition) ?? [];
  return condition.split('||').map((term) => term.trim());
}

function evalOutcomeOf(term: string): string | undefined {
  return term.match(EVAL_OUTCOME_TERM_RE)?.[1];
}

function securityTargetSuites(): (string | undefined)[] {
  const [, files = ''] = PROJECT.match(SECURITY_TARGET_FILES_RE) ?? [];
  return files.split(' ').map((file) => file.match(SUITE_FILE_RE)?.[1]);
}

function throwawayEnv(job: string): (string | undefined)[] {
  return THROWAWAY_ENV.map(
    (key) => job.match(new RegExp(`^ +${key}: (.+)$`, 'm'))?.[1]
  );
}

describe('model gate workflow', () => {
  it('runs the eval-security target with ten trials', () => {
    expect(GATE).toMatch(EVAL_SECURITY_RUN_RE);
    expect(GATE).toMatch(TRIALS_RE);
  });

  it('runs one gate leg at a time, so two verdicts never activate one model', () => {
    expect(GATE).toMatch(ONE_LEG_AT_A_TIME_RE);
  });

  it('evaluates and judges the same pending model', () => {
    expect(GATE).toMatch(EVALUATED_MODEL_RE);
    expect(GATE).toMatch(JUDGED_MODEL_RE);
  });

  it('uses the same throwaway env as the weekly security legs', () => {
    const weekly = throwawayEnv(jobSection(WEEKLY, 'evals'));

    expect(weekly).not.toContain(undefined);
    expect(throwawayEnv(GATE)).toStrictEqual(weekly);
  });

  it('decides the verdict from the suite summaries only when the eval ran, overriding the implicit success() check', () => {
    const terms = conditionTerms(DECIDE_CONDITION_RE);

    expect(terms.map(evalOutcomeOf)).toEqual(
      expect.arrayContaining(EVAL_RAN_OUTCOMES)
    );
    expect(
      terms.filter(
        (term) => !EVAL_RAN_OUTCOMES.includes(evalOutcomeOf(term) ?? '')
      )
    ).toStrictEqual([]);
    expect(GATE).toMatch(DECIDE_RUN_RE);
    expect(GATE.indexOf(EVAL_STEP)).toBeLessThan(GATE.indexOf(DECIDE_STEP));
    expect(GATE.indexOf(DECIDE_STEP)).toBeLessThan(GATE.indexOf(POST_STEP));
  });

  it('posts a decided fail, a pass only when the eval step itself succeeded, and never an inconclusive verdict', () => {
    const [, condition] = GATE.match(POST_CONDITION_RE) ?? [];

    expect(condition).toBe(POSTED_WHEN);
    expect(GATE).toMatch(PASSED_RE);
  });

  it('expects a summary from every suite the security target runs, and from nothing else', () => {
    expect(securityTargetSuites()).toStrictEqual([
      ...EVAL_TARGET_SUITES['eval-security'],
    ]);
  });

  it('fails the leg before the eval when the grader key is missing, since a skipped suite would pass', () => {
    const keyCheck = GATE.indexOf(GRADER_KEY_CHECK);

    expect(keyCheck).toBeGreaterThan(-1);
    expect(keyCheck).toBeLessThan(GATE.indexOf(EVAL_STEP));
  });

  it('never interpolates an expression inside run', () => {
    const scripts = runScripts(WORKFLOW);

    expect(scripts.length).toBeGreaterThan(0);
    expect(
      scripts.filter((script) => script.includes(EXPRESSION_OPEN))
    ).toStrictEqual([]);
  });

  it('gates only a platform selector key, and nothing that could break the matrix', () => {
    const { selectorKey } = pendingEntryPatterns();

    expect(
      PLATFORM_SELECTOR_KEYS.filter((key) => !selectorKey.test(key))
    ).toStrictEqual([]);
    expect(
      [
        UNKNOWN_SELECTOR,
        `${PLATFORM_SELECTOR_KEYS[0]}${TRAILING_NEWLINE}`,
        '',
      ].filter((key) => selectorKey.test(key))
    ).toStrictEqual([]);
  });

  it('gates only a model id without an alias, and nothing that could break the matrix', () => {
    const { modelId } = pendingEntryPatterns();

    expect(
      Object.values(PLATFORM_SEED_MODELS).filter((id) => !modelId.test(id))
    ).toStrictEqual([]);
    expect(
      [ALIAS_PIN, `${PLATFORM_SEED_MODELS.fast}${TRAILING_NEWLINE}`, ''].filter(
        (id) => modelId.test(id)
      )
    ).toStrictEqual([]);
  });

  it('keeps only the validated selector key and model id in the matrix', () => {
    const [script = ''] = runScripts(PENDING);

    expect(script).toMatch(VALIDATED_FIELDS_ONLY_RE);
  });

  it('ends green when the gate secrets are unset', () => {
    const scripts = runScripts(PENDING);

    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatch(UNSET_SECRETS_EXIT_RE);
    expect(GATE).toMatch(GATE_SKIPS_EMPTY_MATRIX_RE);
  });
});
