import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { err, type Result } from 'neverthrow';

import {
  nodesLostBetween,
  restoreStoredAttributes,
} from '@knowtis/editor-schema/server';
import { htmlToMarkdown } from '@knowtis/note-markdown';

import { AgentErrors, type AgentDomainError } from '../../domain/agent-errors';
import {
  applyNoteEdits,
  type NoteEdit,
  type NoteEditFailure,
} from '../../domain/note-edits';
import {
  RETRIEVAL_PORT,
  type RetrievalPort,
} from '../../domain/ports/retrieval.port';
import {
  ProposedMutation,
  type UpdateMutationPayload,
} from '../../domain/proposed-mutation';
import { markdownToNoteHtml } from '../sanitize/html-sanitizer';

const UNRENDERABLE_CONTENT = 'content the server cannot render';

function unrenderableBody(): AgentDomainError {
  return AgentErrors.editWouldLoseContent([UNRENDERABLE_CONTENT]);
}

export interface UpdateProposalInput {
  readonly title?: string;
  readonly contentMarkdown?: string;
}

export interface EditProposalInput {
  readonly edits: readonly NoteEdit[];
  readonly appendMarkdown?: string;
}

interface NoteSubject {
  readonly title: string;
  readonly updatedAt: string;
}

function toEditError(failure: NoteEditFailure): AgentDomainError {
  const position = failure.index + 1;
  return failure.kind === 'not_found'
    ? AgentErrors.editTextNotFound(position, failure.oldText)
    : AgentErrors.editTextAmbiguous(position, failure.oldText, failure.matches);
}

function withAppended(markdown: string, appendMarkdown: string): string {
  const head = markdown.trimEnd();
  return head === '' ? appendMarkdown : `${head}\n\n${appendMarkdown}`;
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
      if (read) {
        if (read.contentStatus !== 'complete') {
          return err(AgentErrors.wholeBodyUpdateRefused(read.contentStatus));
        }
        const body = await this.retrieval.getBody(userId, noteId);
        if (body?.html === null) {
          return err(unrenderableBody());
        }
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

  async buildEdit(
    userId: string,
    noteId: string,
    input: EditProposalInput
  ): Promise<Result<ProposedMutation, AgentDomainError>> {
    const appendMarkdown = input.appendMarkdown?.trim()
      ? input.appendMarkdown
      : undefined;
    if (input.edits.length === 0 && appendMarkdown === undefined) {
      return err(
        AgentErrors.invalidProposal(
          'an edit needs at least one edit or appendMarkdown'
        )
      );
    }
    const body = await this.retrieval.getBody(userId, noteId);
    if (!body) {
      return err(AgentErrors.noteNotFound(noteId));
    }
    if (body.html === null) {
      return err(unrenderableBody());
    }
    const original = htmlToMarkdown(body.html);
    const edited = applyNoteEdits(original, input.edits);
    if (edited.isErr()) {
      return err(toEditError(edited.error));
    }
    const merged =
      appendMarkdown === undefined
        ? edited.value
        : withAppended(edited.value, appendMarkdown);
    if (merged === original) {
      return err(AgentErrors.invalidProposal('the edits change nothing'));
    }
    const contentHtml = markdownToNoteHtml(merged);
    if (merged.trim() && !contentHtml) {
      return err(AgentErrors.sanitizeRejected());
    }
    const lost = nodesLostBetween(body.html, markdownToNoteHtml(original));
    if (lost.length > 0) {
      return err(AgentErrors.editWouldLoseContent(lost));
    }
    const restoredHtml = restoreStoredAttributes(body.html, contentHtml);
    const changes = input.edits.length + (appendMarkdown === undefined ? 0 : 1);
    return ProposedMutation.create({
      id: randomUUID(),
      kind: 'update',
      targetNoteId: noteId,
      payload: { contentHtml: restoredHtml },
      summary: `Update "${body.title}": content edited (${changes} ${changes === 1 ? 'edit' : 'edits'})`,
      baseVersion: body.updatedAt,
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
