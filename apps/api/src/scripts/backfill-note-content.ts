/* eslint-disable no-console */
import { parseArgs } from 'node:util';

import {
  backfillNoteContent,
  drizzleNoteContentStore,
  type BackfillReport,
} from './content-backfill';
import { withScriptDatabase } from './script-context';

const USAGE = 'Usage: pnpm nx run api:backfill-note-content [--apply]';

function printIds(heading: string, ids: readonly string[]): void {
  console.log(`${heading}: ${ids.length}`);
  for (const id of ids) {
    console.log(`  ${id}`);
  }
}

function printReport(report: BackfillReport, apply: boolean): void {
  console.log(
    apply ? 'Applied.' : 'Dry run: nothing was written. Pass --apply to write.'
  );
  console.log(`Notes with a CRDT state: ${report.scanned}`);
  console.log(`Content already current: ${report.unchanged}`);
  printIds(apply ? 'Content updated' : 'Content to update', report.changed);
  if (apply) {
    printIds('Saved again during the run, left as saved', report.superseded);
  }
  console.log(
    `${apply ? 'Embeddings marked stale' : 'Embeddings to mark stale'}: ${report.embeddingsMarkedStale}`
  );
  console.log(`Not repaired: ${report.failed.length}`);
  for (const { id, reason } of report.failed) {
    console.log(`  ${id}: ${reason}`);
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { apply: { type: 'boolean', default: false } },
    strict: true,
  });
  const apply = values.apply;

  const report = await withScriptDatabase((db) =>
    backfillNoteContent(drizzleNoteContentStore(db), { apply })
  );
  printReport(report, apply);
  if (report.failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[backfill-note-content] failed:', error);
  console.error(USAGE);
  process.exitCode = 1;
});
