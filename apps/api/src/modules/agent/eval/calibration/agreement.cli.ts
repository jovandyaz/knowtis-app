/* eslint-disable no-console */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { computeAgreement, formatReport } from './agreement';
import { argValue } from './cli-args';
import { parseJsonl, type JudgmentRow } from './judgment-row';

const DEFAULT_LABELS_DIR = 'src/modules/agent/eval/calibration/labels';

async function collectLabelFiles(path: string): Promise<string[]> {
  const stats = await stat(path);
  if (!stats.isDirectory()) {
    return [path];
  }
  const names = await readdir(path);
  return names
    .filter((name) => name.endsWith('.jsonl'))
    .sort()
    .map((name) => join(path, name));
}

async function main(): Promise<void> {
  const target = resolve(argValue('--labels') ?? DEFAULT_LABELS_DIR);
  const files = await collectLabelFiles(target);
  const rows: JudgmentRow[] = [];
  for (const file of files) {
    rows.push(...parseJsonl(await readFile(file, 'utf8')));
  }
  if (rows.length === 0) {
    throw new Error(`no judgment rows found under ${target}`);
  }
  console.log(formatReport(computeAgreement(rows)));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[eval-agreement] failed:', error);
    process.exit(1);
  });
