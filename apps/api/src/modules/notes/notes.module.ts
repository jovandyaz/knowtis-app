import { Module } from '@nestjs/common';

import {
  CreateNoteHandler,
  CreateShareLinkHandler,
  DeleteNoteHandler,
  GetCollaboratorsHandler,
  GetNoteByTokenHandler,
  GetNoteHandler,
  GetNotesHandler,
  GetShareLinksHandler,
  RevokeAccessHandler,
  RevokeShareLinkHandler,
  ShareNoteHandler,
  UpdateNoteHandler,
} from './application';
import {
  NOTE_READ_REPOSITORY,
  NOTE_REPOSITORY,
  NOTE_WRITE_REPOSITORY,
  PERMISSION_REPOSITORY,
  SHARE_LINK_REPOSITORY,
} from './domain';
import {
  DrizzleNoteRepository,
  DrizzleShareLinkRepository,
} from './infrastructure';
import { NotesController } from './notes.controller';

@Module({
  controllers: [NotesController],
  providers: [
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
      provide: SHARE_LINK_REPOSITORY,
      useClass: DrizzleShareLinkRepository,
    },
    CreateNoteHandler,
    CreateShareLinkHandler,
    UpdateNoteHandler,
    DeleteNoteHandler,
    GetNoteHandler,
    GetNoteByTokenHandler,
    GetNotesHandler,
    GetShareLinksHandler,
    ShareNoteHandler,
    RevokeAccessHandler,
    RevokeShareLinkHandler,
    GetCollaboratorsHandler,
  ],
  exports: [
    GetNoteHandler,
    GetNoteByTokenHandler,
    NOTE_REPOSITORY,
    SHARE_LINK_REPOSITORY,
  ],
})
export class NotesModule {}
