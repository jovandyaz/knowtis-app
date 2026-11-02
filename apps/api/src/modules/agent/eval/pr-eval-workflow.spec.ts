import { describe, expect, it } from 'vitest';

import { jobSection, readWorkflow } from './workflow-text';

const WORKFLOW = readWorkflow('pr-eval.yml');
const JOB = jobSection(WORKFLOW, 'injection-guard');
const PULL_REQUEST_TARGET = 'pull_request_target';
const SAME_REPO_GUARD =
  'github.event.pull_request.head.repo.full_name == github.repository';
const INFORMATIONAL_RE = /^ {4}continue-on-error: true$/m;
const ONE_TRIAL_RE = /^ +AI_EVAL_TRIALS: 1$/m;
const EVAL_RUN_RE = /run: npx nx run api:eval-injection-guard$/m;

describe('PR eval workflow', () => {
  it('never exposes secrets to code from a fork', () => {
    expect(WORKFLOW).not.toContain(PULL_REQUEST_TARGET);
    expect(JOB).toContain(SAME_REPO_GUARD);
  });

  it('informs without blocking while one trial stays this noisy', () => {
    expect(JOB).toMatch(INFORMATIONAL_RE);
    expect(JOB).toMatch(ONE_TRIAL_RE);
  });

  it('runs only the injection guard suite', () => {
    expect(JOB).toMatch(EVAL_RUN_RE);
  });
});
