import { describe, expect, it } from 'vitest';

import { PLATFORM_SELECTOR_KEYS } from '@knowtis/shared-types';

import { PLATFORM_SEED_MODELS } from '../../ai/domain/model-catalog/platform-resolution';
import {
  jobSection,
  jqTestPatterns,
  readWorkflow,
  runScripts,
} from './workflow-text';

const WORKFLOW = readWorkflow('model-gate.yml');
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
const VERDICT_CONDITION_RE =
  /^ +- name: Post the verdict\n +if: \$\{\{ !cancelled\(\) && \((.+)\) \}\}$/m;
const EVAL_OUTCOME_TERM_RE = /^steps\.eval\.outcome == '(\w+)'$/;
const EVAL_RAN_OUTCOMES = ['success', 'failure'];
const PASSED_RE = /^ +PASSED: \$\{\{ steps\.eval\.outcome == 'success' \}\}$/m;
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

function verdictConditionTerms(): string[] {
  const [, condition = ''] = GATE.match(VERDICT_CONDITION_RE) ?? [];
  return condition.split('||').map((term) => term.trim());
}

function evalOutcomeOf(term: string): string | undefined {
  return term.match(EVAL_OUTCOME_TERM_RE)?.[1];
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

  it('posts the verdict when the eval passed or failed, overriding the implicit success() check', () => {
    expect(verdictConditionTerms().map(evalOutcomeOf)).toEqual(
      expect.arrayContaining(EVAL_RAN_OUTCOMES)
    );
    expect(GATE).toMatch(PASSED_RE);
    expect(GATE).toContain(EVAL_STEP);
  });

  it('never posts a verdict when the eval did not run', () => {
    expect(
      verdictConditionTerms().filter(
        (term) => !EVAL_RAN_OUTCOMES.includes(evalOutcomeOf(term) ?? '')
      )
    ).toStrictEqual([]);
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
