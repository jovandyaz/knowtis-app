/* eslint-disable no-console */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { argValue } from './cli-args';
import { extractJudgments } from './judgment-extract';
import { toJsonl, type JudgmentRow } from './judgment-row';

function isNativeResultFile(name: string): boolean {
  return (
    name.endsWith('.json') &&
    !name.endsWith('.summary.json') &&
    name !== 'vitest.json'
  );
}

async function main(): Promise<void> {
  const dirArg = argValue('--dir') ?? process.env['AI_EVAL_OUTPUT_DIR'];
  if (!dirArg || !dirArg.trim()) {
    throw new Error(
      'results dir required: pass --dir <path> or set AI_EVAL_OUTPUT_DIR'
    );
  }
  const dir = resolve(dirArg.trim());
  const outPath = resolve(argValue('--out') ?? join(dir, 'judgments.jsonl'));
  const names = (await readdir(dir)).filter(isNativeResultFile).sort();
  const rows: JudgmentRow[] = [];
  for (const name of names) {
    const file: unknown = JSON.parse(await readFile(join(dir, name), 'utf8'));
    rows.push(...extractJudgments(file, basename(name, '.json')));
  }
  if (rows.length === 0) {
    throw new Error(`no llm-rubric judgments found in ${dir}`);
  }
  await writeFile(outPath, toJsonl(rows), 'utf8');
  console.log(`wrote ${rows.length} judgment rows to ${outPath}`);
}

main().catch((error) => {
  console.error('[eval-judgments] failed:', error);
  process.exitCode = 1;
});
