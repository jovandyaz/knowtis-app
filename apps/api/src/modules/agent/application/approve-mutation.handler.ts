import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import { SUBJECTS } from '@knowtis/authorization';

import { AppAbilityFactory } from '../../authorization/ability.factory';
import { CreateNoteHandler } from '../../notes/application/commands/create-note.handler';
import { ShareNoteHandler } from '../../notes/application/commands/share-note.handler';
import { UpdateNoteHandler } from '../../notes/application/commands/update-note.handler';
import { NOTE_REPOSITORY, type NoteRepository } from '../../notes/domain/ports';
import {
  USER_READ_REPOSITORY,
  type UserReadRepository,
} from '../../users/domain/ports/user-read.repository';
import { AgentErrors, type AgentDomainError } from '../domain/agent-errors';
import type { AgentCommitResult } from '../domain/agent-event';
import {
  PENDING_MUTATION_STORE,
  type PendingMutationStore,
} from '../domain/ports/pending-mutation.store';
import type {
  CreateMutationPayload,
  ProposedMutation,
  ShareMutationPayload,
  UpdateMutationPayload,
} from '../domain/proposed-mutation';

export interface ApproveMutationInput {
  readonly proposalId: string;
  readonly userId: string;
}

export interface ApproveMutationOutput {
  readonly result: AgentCommitResult;
  readonly outcome: string;
  readonly toolName: string;
}

@Injectable()
export class ApproveMutationHandler {
  constructor(
    @Inject(PENDING_MUTATION_STORE) private readonly store: PendingMutationStore,
    private readonly createHandler: CreateNoteHandler,
    private readonly updateHandler: UpdateNoteHandler,
    private readonly shareHandler: ShareNoteHandler,
    private readonly abilityFactory: AppAbilityFactory,
    @Inject(NOTE_REPOSITORY) private readonly noteRepo: NoteRepository,
    @Inject(USER_READ_REPOSITORY) private readonly userRepo: UserReadRepository
  ) {}

  async execute(
    input: ApproveMutationInput
  ): Promise<Result<ApproveMutationOutput, AgentDomainError>> {
    const record = await this.store.take(input.proposalId, input.userId);
    if (!record) {
      return err(AgentErrors.proposalExpired());
    }
    const m = record.mutation;

    if (m.kind === 'create') {
      return this.commitCreate(input.userId, m);
    }
    return this.commitOnExisting(input.userId, m, record.toolName);
  }

  private can(
    userId: string,
    action: 'create' | 'update' | 'share',
    subject: { id: string; ownerId: string; generalAccess: string }
  ): boolean {
    const ability = this.abilityFactory.createAbility({
      user: { id: userId },
      permissionContext: { sharedNotes: [] },
    });
    return ability.can(action, { __typename: SUBJECTS.Note, ...subject });
  }

  private async commitCreate(
    userId: string,
    m: ProposedMutation
  ): Promise<Result<ApproveMutationOutput, AgentDomainError>> {
    if (!this.can(userId, 'create', { id: '', ownerId: userId, generalAccess: 'restricted' })) {
      return err(AgentErrors.permissionDenied());
    }
    const payload = m.payload as CreateMutationPayload;
    const res = await this.createHandler.execute({
      title: payload.title,
      content: payload.contentHtml,
      ownerId: userId,
    });
    if (res.isErr()) {
      return err(AgentErrors.permissionDenied());
    }
    const note = res.value;
    return ok({
      result: { noteId: note.id, title: note.title, kind: 'create' },
      outcome: `created the note "${note.title}"`,
      toolName: 'proposeCreateNote',
    });
  }

  private async commitOnExisting(
    userId: string,
    m: ProposedMutation,
    toolName: string
  ): Promise<Result<ApproveMutationOutput, AgentDomainError>> {
    const noteId = m.targetNoteId as string;
    const note = await this.noteRepo.findById(noteId);
    if (!note) {
      return err(AgentErrors.noteNotFound(noteId));
    }
    if (
      !this.can(userId, m.kind === 'share' ? 'share' : 'update', {
        id: note.id,
        ownerId: note.ownerId,
        generalAccess: note.generalAccess,
      })
    ) {
      return err(AgentErrors.permissionDenied());
    }
    if (m.baseVersion && note.updatedAt.toISOString() !== m.baseVersion) {
      return err(AgentErrors.staleNote(noteId));
    }

    if (m.kind === 'update') {
      const payload = m.payload as UpdateMutationPayload;
      const res = await this.updateHandler.execute({
        noteId,
        userId,
        ...(payload.title !== undefined && { title: payload.title }),
        ...(payload.contentHtml !== undefined && {
          content: payload.contentHtml,
        }),
      });
      if (res.isErr()) {
        return err(AgentErrors.permissionDenied());
      }
      return ok({
        result: { noteId: res.value.id, title: res.value.title, kind: 'update' },
        outcome: `updated the note "${res.value.title}"`,
        toolName,
      });
    }

    const share = m.payload as ShareMutationPayload;
    const target = await this.userRepo.findByEmail(share.targetEmail);
    if (!target) {
      return err(AgentErrors.noteNotFound(share.targetEmail));
    }
    const res = await this.shareHandler.execute({
      noteId,
      userId,
      targetUserId: target.id,
      permission: share.permission,
    });
    if (res.isErr()) {
      return err(AgentErrors.permissionDenied());
    }
    return ok({
      result: { noteId, title: note.title, kind: 'share' },
      outcome: `shared "${note.title}" with ${share.targetEmail} as ${share.permission}`,
      toolName,
    });
  }
}
