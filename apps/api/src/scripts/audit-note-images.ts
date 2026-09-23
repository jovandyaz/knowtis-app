/* eslint-disable no-console */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { validateEnv } from '../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  type Database,
} from '../database/database.module';
import {
  auditNoteImages,
  drizzleNoteImageStore,
  type ImageAuditReport,
  type NoteForeignImages,
} from './note-image-audit';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env.local', '.env'],
    }),
    DatabaseModule,
  ],
})
class AuditModule {}

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
  const app = await NestFactory.createApplicationContext(AuditModule, {
    logger: ['error', 'warn'],
  });
  try {
    const db = app.get<Database>(DATABASE_CONNECTION);
    printReport(await auditNoteImages(drizzleNoteImageStore(db)));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('[audit-note-images] failed:', error);
  process.exitCode = 1;
});
