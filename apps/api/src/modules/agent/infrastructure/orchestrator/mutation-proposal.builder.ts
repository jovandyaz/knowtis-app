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
import { markdownToNoteHtml } from '../sanitize/html-sanitizer';

export interface UpdateProposalInput {
  readonly title?: string;
  readonly contentMarkdown?: string;
}

interface NoteSubject {
  readonly title: string;
  readonly updatedAt: string;
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
    const contentHtml = markdownToNoteHtml(contentMarkdown);
    if (contentMarkdown.trim() && !contentHtml) {
      return err(AgentErrors.sanitizeRejected());
    }
    return ProposedMutation.create({
      id: randomUUID(),
      kind: 'create',
      payload: { title, contentHtml },
      summary: `Create note "${title}"`,
    });
  }

  async buildUpdate(
    userId: string,
    noteId: string,
    input: UpdateProposalInput
  ): Promise<Result<ProposedMutation, AgentDomainError>> {
    if (input.title === undefined && input.contentMarkdown === undefined) {
      return err(
        AgentErrors.invalidProposal('update requires a title or content change')
      );
    }
    let contentHtml: string | undefined;
    let note: NoteSubject | null;
    if (input.contentMarkdown === undefined) {
      note = await this.retrieval.getBody(userId, noteId);
    } else {
      const read = await this.retrieval.getById(userId, noteId);
      if (read && read.contentStatus !== 'complete') {
        return err(AgentErrors.wholeBodyUpdateRefused(read.contentStatus));
      }
      note = read;
    }
    if (!note) {
      return err(AgentErrors.noteNotFound(noteId));
    }
    if (input.contentMarkdown !== undefined) {
      contentHtml = markdownToNoteHtml(input.contentMarkdown);
      if (input.contentMarkdown.trim() && !contentHtml) {
        return err(AgentErrors.sanitizeRejected());
      }
    }
    const payload: UpdateMutationPayload = {
      ...(input.title !== undefined && { title: input.title }),
      ...(contentHtml !== undefined && { contentHtml }),
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
      baseVersion: note.updatedAt,
    });
  }

  async buildShare(
    userId: string,
    noteId: string,
    targetEmail: string,
    permission: 'viewer' | 'editor'
  ): Promise<Result<ProposedMutation, AgentDomainError>> {
    const note = await this.retrieval.getBody(userId, noteId);
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
