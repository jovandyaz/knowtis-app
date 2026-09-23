/* eslint-disable no-console */
import {
  auditNoteImages,
  drizzleNoteImageStore,
  type ImageAuditReport,
  type NoteForeignImages,
} from './note-image-audit';
import { withScriptDatabase } from './script-context';

function printNotes(
  heading: string,
  notes: readonly NoteForeignImages[]
): void {
  console.log(`${heading}: ${notes.length}`);
  for (const { id, inState, inContent } of notes) {
    for (const host of inState) {
      console.log(`  ${id}: ${host} (CRDT state)`);
    }
    for (const host of inContent) {
      console.log(`  ${id}: ${host} (content column)`);
    }
  }
}

function printReport(report: ImageAuditReport): void {
  console.log('Read-only audit: nothing was written.');
  console.log(
    `Notes scanned: ${report.scanned} (in the trash: ${report.scannedInTrash})`
  );
  printNotes('Notes with foreign images', report.foreign);
  printNotes('Notes in the trash with foreign images', report.foreignInTrash);
  console.log(
    `CRDT states that could not be read: ${report.unreadable.length}`
  );
  for (const { id, reason } of report.unreadable) {
    console.log(`  ${id}: ${reason}`);
  }
}

async function main(): Promise<void> {
  printReport(
    await withScriptDatabase((db) => auditNoteImages(drizzleNoteImageStore(db)))
  );
}

main().catch((error) => {
  console.error('[audit-note-images] failed:', error);
  process.exitCode = 1;
});
