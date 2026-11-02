import { describe, expect, it } from 'vitest';

import { jobSection, readWorkflow } from './workflow-text';

const WORKFLOW = readWorkflow('pr-eval.yml');
const JOB = jobSection(WORKFLOW, 'injection-guard');
const PULL_REQUEST_TARGET = 'pull_request_target';
const SAME_REPO_GUARD =
  'github.event.pull_request.head.repo.full_name == github.repository';
const INFORMATIONAL_RE = /^ {4}continue-on-error: true$/m;
const ONE_TRIAL_RE = /^ +AI_EVAL_TRIALS: 1$/m;
const REDIS_SERVICE_RE = /^ {6}redis:\n {8}image: redis:/m;
const REDIS_URL_RE = /^ {6}REDIS_URL: redis:\/\/127\.0\.0\.1:6379$/m;
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

describe.each([
  ['pr-eval.yml', 'injection-guard'],
  ['nightly-eval.yml', 'evals'],
  ['model-gate.yml', 'gate'],
])('%s', (fileName, job) => {
  it('gives the booted module the Redis it dials, so its failures stay out of the log', () => {
    const section = jobSection(readWorkflow(fileName), job);
    expect(section).toMatch(REDIS_SERVICE_RE);
    expect(section).toMatch(REDIS_URL_RE);
  });
});
