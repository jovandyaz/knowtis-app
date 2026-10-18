/* eslint-disable no-console */
import { execFile } from 'node:child_process';
import { appendFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { messageOf, requiredEnv } from './cli-env';
import {
  candidateRunIds,
  findBaselines,
  hasLiveArtifact,
  renderDriftReport,
  type BaselineSearch,
  type RunLoader,
} from './eval-drift';
import {
  EVAL_TARGET_SUITES,
  isEvalTarget,
  readSuiteSummaries,
} from './eval-summary';

const WORKFLOW_FILE = 'nightly-eval.yml';
const BASELINE_BRANCH = 'main';
const BASELINE_RUN_LOOKBACK = 20;
const ARTIFACTS_PER_PAGE = 100;

const run = promisify(execFile);

async function gh(args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await run('gh', [...args]);
    return stdout;
  } catch (error) {
    const stderr =
      typeof error === 'object' &&
      error !== null &&
      'stderr' in error &&
      typeof error.stderr === 'string'
        ? error.stderr.trim()
        : '';
    const detail = stderr || messageOf(error);
    throw new Error(`gh ${args[0]} ${args[1]}: ${detail}`);
  }
}

async function listEarlierRuns(
  repository: string,
  currentRunId: string
): Promise<string[]> {
  const listing = await gh([
    'run',
    'list',
    '--repo',
    repository,
    '--workflow',
    WORKFLOW_FILE,
    '--branch',
    BASELINE_BRANCH,
    '--status',
    'completed',
    '--limit',
    String(BASELINE_RUN_LOOKBACK),
    '--json',
    'databaseId',
  ]);
  return candidateRunIds(JSON.parse(listing), currentRunId);
}

function runLoader(
  repository: string,
  artifactName: string,
  suites: readonly string[],
  scratch: string
): RunLoader {
  return async (runId) => {
    const listing = await gh([
      'api',
      `repos/${repository}/actions/runs/${runId}/artifacts?per_page=${ARTIFACTS_PER_PAGE}`,
    ]);
    if (!hasLiveArtifact(JSON.parse(listing), artifactName)) {
      return new Map();
    }
    const dir = join(scratch, runId);
    await gh([
      'run',
      'download',
      runId,
      '--repo',
      repository,
      '--name',
      artifactName,
      '--dir',
      dir,
    ]);
    return readSuiteSummaries(dir, suites);
  };
}

async function main(): Promise<void> {
  const dir = resolve(requiredEnv('AI_EVAL_OUTPUT_DIR'));
  const target = requiredEnv('EVAL_TARGET');
  if (!isEvalTarget(target)) {
    throw new Error(`EVAL_TARGET '${target}' is not an eval target`);
  }
  const artifactName = requiredEnv('EVAL_DRIFT_ARTIFACT_NAME');
  const repository = requiredEnv('GITHUB_REPOSITORY');
  const currentRunId = requiredEnv('GITHUB_RUN_ID');
  const suites = EVAL_TARGET_SUITES[target];
  const current = await readSuiteSummaries(dir, suites);
  const scratch = await mkdtemp(join(tmpdir(), 'eval-drift-'));
  let search: BaselineSearch;
  try {
    search = await findBaselines(
      suites,
      await listEarlierRuns(repository, currentRunId),
      runLoader(repository, artifactName, suites, scratch)
    );
  } catch (error) {
    search = { baselines: new Map(), errors: [messageOf(error)] };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
  const report = renderDriftReport({
    target,
    current,
    baselines: search.baselines,
    lookback: BASELINE_RUN_LOOKBACK,
    branch: BASELINE_BRANCH,
    errors: search.errors,
  });
  const summaryFile = process.env['GITHUB_STEP_SUMMARY'];
  if (summaryFile) {
    await appendFile(summaryFile, report, 'utf8');
  } else {
    console.log(report);
  }
  if (search.errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[eval-drift] failed:', error);
  process.exitCode = 1;
});
