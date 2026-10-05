import { describe, expect, it } from 'vitest';

import { jobSection, readWorkflow, runScripts } from './workflow-text';

const WORKFLOW = readWorkflow('model-gate.yml');
const WEEKLY = readWorkflow('nightly-eval.yml');
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
const VERDICT_STEP_RE =
  /^ +- name: Post the verdict\n +if: \$\{\{ !cancelled\(\) \}\}$/m;
const PASSED_RE = /^ +PASSED: \$\{\{ steps\.eval\.outcome == 'success' \}\}$/m;
const GRADER_KEY_CHECK = 'if [ -z "$ANTHROPIC_API_KEY" ]; then';
const UNSET_SECRETS_EXIT_RE =
  /if \[ -z "\$KNOWTIS_API_URL" \] \|\| \[ -z "\$MODEL_GATE_TOKEN" \]; then\n +echo "::notice::.+"\n +echo 'matrix=\[\]' >> "\$GITHUB_OUTPUT"\n +exit 0\n +fi/;
const GATE_SKIPS_EMPTY_MATRIX_RE =
  /^ {4}if: \$\{\{ needs\.pending\.outputs\.matrix != '\[\]' \}\}$/m;
const EXPRESSION_OPEN = '${{';

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

  it('evaluates and judges the same pending model', () => {
    expect(GATE).toMatch(EVALUATED_MODEL_RE);
    expect(GATE).toMatch(JUDGED_MODEL_RE);
  });

  it('uses the same throwaway env as the weekly security legs', () => {
    const weekly = throwawayEnv(jobSection(WEEKLY, 'evals'));

    expect(weekly).not.toContain(undefined);
    expect(throwawayEnv(GATE)).toStrictEqual(weekly);
  });

  it('posts the verdict whenever the leg was not cancelled', () => {
    expect(GATE).toMatch(VERDICT_STEP_RE);
    expect(GATE).toMatch(PASSED_RE);
    expect(GATE).toContain(EVAL_STEP);
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

  it('ends green when the gate secrets are unset', () => {
    const scripts = runScripts(jobSection(WORKFLOW, 'pending'));

    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatch(UNSET_SECRETS_EXIT_RE);
    expect(GATE).toMatch(GATE_SKIPS_EMPTY_MATRIX_RE);
  });
});
