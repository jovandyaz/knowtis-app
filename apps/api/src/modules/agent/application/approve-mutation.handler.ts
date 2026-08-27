import { Inject, Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import { SUBJECTS } from '@knowtis/authorization';

import { AppAbilityFactory } from '../../authorization/ability.factory';
import { CreateNoteHandler } from '../../notes/application/commands/create-note.handler';
import { ShareNoteHandler } from '../../notes/application/commands/share-note.handler';
import { UpdateNoteHandler } from '../../notes/application/commands/update-note.handler';
import { NoteErrorCodes } from '../../notes/domain';
import { NOTE_REPOSITORY, type NoteRepository } from '../../notes/domain/ports';
import {
  USER_READ_REPOSITORY,
  type UserReadRepository,
} from '../../users/domain/ports/user-read.repository';
import { VerifiedIdentityPolicy } from '../../users/verified-identity.policy';
import { AgentErrors, type AgentDomainError } from '../domain/agent-errors';
import type { AgentCommitResult } from '../domain/agent-event';
import {
  PENDING_MUTATION_STORE,
  type PendingMutationStore,
} from '../domain/ports/pending-mutation.store';
import type {
  CreateProposedMutation,
  ProposedMutation,
  ShareProposedMutation,
  UpdateProposedMutation,
} from '../domain/proposed-mutation';

export interface ApproveMutationInput {
  readonly proposalId: string;
  readonly userId: string;
}

export interface ApproveMutationOutput {
  readonly result: AgentCommitResult;
  readonly outcome: string;
  readonly toolName: string;
  readonly conversationId?: string;
}

@Injectable()
export class ApproveMutationHandler {
  private readonly logger = new Logger(ApproveMutationHandler.name);

  constructor(
    @Inject(PENDING_MUTATION_STORE)
    private readonly store: PendingMutationStore,
    private readonly createHandler: CreateNoteHandler,
    private readonly updateHandler: UpdateNoteHandler,
    private readonly shareHandler: ShareNoteHandler,
    private readonly abilityFactory: AppAbilityFactory,
    @Inject(NOTE_REPOSITORY) private readonly noteRepo: NoteRepository,
    @Inject(USER_READ_REPOSITORY) private readonly userRepo: UserReadRepository,
    private readonly verifiedIdentity: VerifiedIdentityPolicy
  ) {}

  async execute(
    input: ApproveMutationInput
  ): Promise<Result<ApproveMutationOutput, AgentDomainError>> {
    const record = await this.store.take(input.proposalId, input.userId);
    if (!record) {
      return err(AgentErrors.proposalExpired());
    }
    const m = record.mutation;
    const withConversation = (
      res: Result<ApproveMutationOutput, AgentDomainError>
    ): Result<ApproveMutationOutput, AgentDomainError> =>
      res.map((out) =>
        record.conversationId
          ? { ...out, conversationId: record.conversationId }
          : out
      );

    switch (m.kind) {
      case 'create':
        return withConversation(await this.commitCreate(input.userId, m));
      case 'update':
        return withConversation(
          await this.commitUpdate(input.userId, m, record.toolName)
        );
      case 'share':
        return withConversation(
          await this.commitShare(input.userId, m, record.toolName)
        );
      default: {
        const _exhaustive: never = m;
        return err(
          AgentErrors.invalidProposal(
            `unknown mutation kind: ${String(_exhaustive)}`
          )
        );
      }
    }
  }

  private canCreate(userId: string): boolean {
    const ability = this.abilityFactory.createAbility({
      user: { id: userId },
      permissionContext: { sharedNotes: [] },
    });
    return ability.can('create', {
      __typename: SUBJECTS.Note,
      id: '',
      ownerId: userId,
      generalAccess: 'restricted',
    });
  }

  private async commitCreate(
    userId: string,
    m: CreateProposedMutation
  ): Promise<Result<ApproveMutationOutput, AgentDomainError>> {
    if (!this.canCreate(userId)) {
      return err(AgentErrors.permissionDenied());
    }
    const res = await this.createHandler.execute({
      title: m.payload.title,
      content: m.payload.contentHtml,
      ownerId: userId,
    });
    if (res.isErr()) {
      return err(this.mapCommitError(m, res.error));
    }
    const note = res.value;
    return ok({
      result: { noteId: note.id, title: note.title, kind: 'create' },
      outcome: `created the note "${note.title}"`,
      toolName: 'proposeCreateNote',
    });
  }

  private async commitUpdate(
    userId: string,
    m: UpdateProposedMutation,
    toolName: string
  ): Promise<Result<ApproveMutationOutput, AgentDomainError>> {
    const note = await this.noteRepo.findById(m.targetNoteId);
    if (!note) {
      return err(AgentErrors.noteNotFound(m.targetNoteId));
    }
    if (m.baseVersion && note.updatedAt.toISOString() !== m.baseVersion) {
      return err(AgentErrors.staleNote(m.targetNoteId));
    }
    const res = await this.updateHandler.execute({
      noteId: m.targetNoteId,
      userId,
      ...(m.payload.title !== undefined && { title: m.payload.title }),
      ...(m.payload.contentHtml !== undefined && {
        content: m.payload.contentHtml,
      }),
    });
    if (res.isErr()) {
      return err(this.mapCommitError(m, res.error));
    }
    return ok({
      result: {
        noteId: res.value.id,
        title: res.value.title,
        kind: 'update',
      },
      outcome: `updated the note "${res.value.title}"`,
      toolName,
    });
  }

  private async commitShare(
    userId: string,
    m: ShareProposedMutation,
    toolName: string
  ): Promise<Result<ApproveMutationOutput, AgentDomainError>> {
    // Ahead of the lookups, not only inside ShareNoteHandler: resolving the
    // target email first would answer whether that account exists.
    if (!(await this.verifiedIdentity.isVerified(userId))) {
      return err(AgentErrors.emailNotVerified());
    }
    const note = await this.noteRepo.findById(m.targetNoteId);
    if (!note) {
      return err(AgentErrors.noteNotFound(m.targetNoteId));
    }
    const target = await this.userRepo.findByEmail(m.payload.targetEmail);
    if (!target) {
      return err(AgentErrors.targetUserNotFound(m.payload.targetEmail));
    }
    const res = await this.shareHandler.execute({
      noteId: m.targetNoteId,
      userId,
      targetUserId: target.id,
      permission: m.payload.permission,
    });
    if (res.isErr()) {
      return err(this.mapCommitError(m, res.error));
    }
    return ok({
      result: { noteId: m.targetNoteId, title: note.title, kind: 'share' },
      outcome: `shared "${note.title}" with ${m.payload.targetEmail} as ${m.payload.permission}`,
      toolName,
    });
  }

  private mapCommitError(
    m: ProposedMutation,
    error: { code: string; message: string }
  ): AgentDomainError {
    this.logger.warn({
      event: 'agent.commit.failed',
      proposalId: m.id,
      kind: m.kind,
      code: error.code,
    });
    if (error.code === NoteErrorCodes.EMAIL_NOT_VERIFIED) {
      return AgentErrors.emailNotVerified();
    }
    if (error.code === NoteErrorCodes.PERMISSION_DENIED) {
      return AgentErrors.permissionDenied();
    }
    return AgentErrors.commitFailed(error.code, error.message);
  }
}
