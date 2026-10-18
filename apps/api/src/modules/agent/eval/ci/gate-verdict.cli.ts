/* eslint-disable no-console */
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { requiredEnv } from './cli-env';
import { EVAL_TARGET_SUITES, readSuiteSummaries } from './eval-summary';
import { decideGateVerdict, gateExpectationFromEnv } from './gate-verdict';

async function main(): Promise<void> {
  const dir = resolve(requiredEnv('AI_EVAL_OUTPUT_DIR'));
  const expected = gateExpectationFromEnv();
  const decision = decideGateVerdict(
    expected,
    await readSuiteSummaries(dir, EVAL_TARGET_SUITES['eval-security'])
  );
  console.log(
    `Gate verdict for ${expected.model} at ${expected.trials} trials: ${decision.verdict}`
  );
  for (const reason of decision.reasons) {
    console.log(`- ${reason}`);
  }
  const output = process.env['GITHUB_OUTPUT'];
  if (output) {
    await appendFile(output, `verdict=${decision.verdict}\n`, 'utf8');
  }
  if (decision.verdict === 'inconclusive') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[eval-gate-verdict] failed:', error);
  process.exitCode = 1;
});
