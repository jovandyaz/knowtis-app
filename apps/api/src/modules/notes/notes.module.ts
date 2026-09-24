import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../config/env.config';
import { UsersModule } from '../users/users.module';
import {
  CreateNoteHandler,
  DeleteNoteHandler,
  DeleteTagHandler,
  GetCollaboratorsHandler,
  GetNoteByTokenHandler,
  GetNoteCountsHandler,
  GetNoteHandler,
  GetNotesHandler,
  GetTagsHandler,
  RestoreNoteHandler,
  RevokeAccessHandler,
  ShareNoteHandler,
  UpdateNoteHandler,
  UpdateTagHandler,
} from './application';
import { ImportImageHandler } from './application/commands/import-image.handler';
import { RotateShareLinkHandler } from './application/commands/rotate-share-link.handler';
import { UploadImageHandler } from './application/commands/upload-image.handler';
import { NoteImageStoreService } from './application/services/note-image-store.service';
import {
  NOTE_READ_REPOSITORY,
  NOTE_REPOSITORY,
  NOTE_WRITE_REPOSITORY,
  PERMISSION_REPOSITORY,
  TAG_REPOSITORY,
} from './domain';
import { ACCESS_SNAPSHOT_REPOSITORY } from './domain/ports/access-snapshot.repository';
import { IMAGE_STORAGE } from './domain/ports/image-storage.port';
import { NOTE_IMAGE_REPOSITORY } from './domain/ports/note-image.repository';
import { REMOTE_IMAGE_FETCHER } from './domain/ports/remote-image-fetcher.port';
import { DrizzleNoteRepository } from './infrastructure';
import {
  ACCESS_DATABASE_CONNECTION,
  AccessDatabase,
} from './infrastructure/persistence/access-database';
import { DrizzleAccessSnapshotRepository } from './infrastructure/persistence/drizzle-access-snapshot.repository';
import { DrizzleNoteImageRepository } from './infrastructure/persistence/drizzle-note-image.repository';
import { DrizzleTagRepository } from './infrastructure/persistence/drizzle-tag.repository';
import { SafeRemoteImageFetcher } from './infrastructure/remote-image/safe-remote-image-fetcher';
import { VercelBlobStorage } from './infrastructure/storage/vercel-blob.storage';
import { NotesController } from './notes.controller';
import { TagsController } from './tags.controller';

@Module({
  imports: [UsersModule],
  controllers: [NotesController, TagsController],
  providers: [
    AccessDatabase,
    {
      provide: ACCESS_DATABASE_CONNECTION,
      useFactory: (access: AccessDatabase) => access.db,
      inject: [AccessDatabase],
    },
    {
      provide: ACCESS_SNAPSHOT_REPOSITORY,
      useClass: DrizzleAccessSnapshotRepository,
    },
    {
      provide: NOTE_REPOSITORY,
      useClass: DrizzleNoteRepository,
    },
    {
      provide: NOTE_READ_REPOSITORY,
      useExisting: NOTE_REPOSITORY,
    },
    {
      provide: NOTE_WRITE_REPOSITORY,
      useExisting: NOTE_REPOSITORY,
    },
    {
      provide: PERMISSION_REPOSITORY,
      useExisting: NOTE_REPOSITORY,
    },
    {
      provide: TAG_REPOSITORY,
      useClass: DrizzleTagRepository,
    },
    CreateNoteHandler,
    UpdateNoteHandler,
    DeleteNoteHandler,
    RestoreNoteHandler,
    GetNoteHandler,
    GetNoteByTokenHandler,
    GetNotesHandler,
    GetNoteCountsHandler,
    ShareNoteHandler,
    RevokeAccessHandler,
    GetCollaboratorsHandler,
    GetTagsHandler,
    UpdateTagHandler,
    DeleteTagHandler,
    UploadImageHandler,
    ImportImageHandler,
    NoteImageStoreService,
    RotateShareLinkHandler,
    { provide: IMAGE_STORAGE, useClass: VercelBlobStorage },
    { provide: NOTE_IMAGE_REPOSITORY, useClass: DrizzleNoteImageRepository },
    {
      provide: REMOTE_IMAGE_FETCHER,
      useFactory: (config: ConfigService<EnvConfig, true>) =>
        new SafeRemoteImageFetcher({
          allowedIps: config.get('IMAGE_IMPORT_ALLOWED_IPS', { infer: true }),
        }),
      inject: [ConfigService],
    },
  ],
  exports: [
    ACCESS_SNAPSHOT_REPOSITORY,
    CreateNoteHandler,
    UpdateNoteHandler,
    ShareNoteHandler,
    GetNoteHandler,
    GetNoteByTokenHandler,
    NOTE_REPOSITORY,
    NOTE_READ_REPOSITORY,
    TAG_REPOSITORY,
  ],
})
export class NotesModule {}
