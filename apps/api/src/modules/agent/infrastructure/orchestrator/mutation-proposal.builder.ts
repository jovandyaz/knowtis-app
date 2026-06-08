import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { err, type Result } from 'neverthrow';

import { AgentErrors, type AgentDomainError } from '../../domain/agent-errors';
import {
  RETRIEVAL_PORT,
  type RetrievalPort,
} from '../../domain/ports/retrieval.port';
import {
  ProposedMutation,
  type UpdateMutationPayload,
} from '../../domain/proposed-mutation';
import { markdownToSafeHtml } from '../sanitize/html-sanitizer';

export interface UpdateProposalInput {
  readonly title?: string;
  readonly contentMarkdown?: string;
}

@Injectable()
export class MutationProposalBuilder {
  constructor(
    @Inject(RETRIEVAL_PORT) private readonly retrieval: RetrievalPort
  ) {}

  async buildCreate(
    _userId: string,
    title: string,
    contentMarkdown: string
  ): Promise<Result<ProposedMutation, AgentDomainError>> {
    const contentHtml = markdownToSafeHtml(contentMarkdown);
    return ProposedMutation.create({
      id: randomUUID(),
      kind: 'create',
      payload: { title, contentHtml },
      summary: `Create note "${title}"`,
      previewHtml: contentHtml,
    });
  }

  async buildUpdate(
    userId: string,
    noteId: string,
    input: UpdateProposalInput
  ): Promise<Result<ProposedMutation, AgentDomainError>> {
    const note = await this.retrieval.getById(userId, noteId);
    if (!note) {
      return err(AgentErrors.noteNotFound(noteId));
    }
    const payload: UpdateMutationPayload = {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.contentMarkdown !== undefined && {
        contentHtml: markdownToSafeHtml(input.contentMarkdown),
      }),
    };
    const parts: string[] = [];
    if (input.title !== undefined) {
      parts.push(`title → "${input.title}"`);
    }
    if (input.contentMarkdown !== undefined) {
      parts.push('content updated');
    }
    return ProposedMutation.create({
      id: randomUUID(),
      kind: 'update',
      targetNoteId: noteId,
      payload,
      summary: `Update "${note.title}": ${parts.join(', ') || 'no changes'}`,
      ...(payload.contentHtml && { previewHtml: payload.contentHtml }),
      baseVersion: note.updatedAt,
    });
  }

  async buildShare(
    userId: string,
    noteId: string,
    targetEmail: string,
    permission: 'viewer' | 'editor'
  ): Promise<Result<ProposedMutation, AgentDomainError>> {
    const note = await this.retrieval.getById(userId, noteId);
    if (!note) {
      return err(AgentErrors.noteNotFound(noteId));
    }
    return ProposedMutation.create({
      id: randomUUID(),
      kind: 'share',
      targetNoteId: noteId,
      payload: { targetEmail, permission },
      summary: `Share "${note.title}" with ${targetEmail} as ${permission}`,
      baseVersion: note.updatedAt,
    });
  }
}
