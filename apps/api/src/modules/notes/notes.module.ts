import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { McpScopeGuard } from '../mcp/guards/mcp-scope.guard';
import {
  CreateNoteHandler,
  DeleteNoteHandler,
  GetCollaboratorsHandler,
  GetNoteByTokenHandler,
  GetNoteHandler,
  GetNotesHandler,
  RevokeAccessHandler,
  ShareNoteHandler,
  UpdateNoteHandler,
} from './application';
import {
  NOTE_READ_REPOSITORY,
  NOTE_REPOSITORY,
  NOTE_WRITE_REPOSITORY,
  PERMISSION_REPOSITORY,
} from './domain';
import { DrizzleNoteRepository } from './infrastructure';
import { NotesController } from './notes.controller';

@Module({
  imports: [JwtModule.register({})],
  controllers: [NotesController],
  providers: [
    McpScopeGuard,
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
    CreateNoteHandler,
    UpdateNoteHandler,
    DeleteNoteHandler,
    GetNoteHandler,
    GetNoteByTokenHandler,
    GetNotesHandler,
    ShareNoteHandler,
    RevokeAccessHandler,
    GetCollaboratorsHandler,
  ],
  exports: [GetNoteHandler, GetNoteByTokenHandler, NOTE_REPOSITORY],
})
export class NotesModule {}
