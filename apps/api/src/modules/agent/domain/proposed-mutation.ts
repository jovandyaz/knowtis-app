import { err, ok, type Result } from 'neverthrow';

import { AgentErrors, type AgentDomainError } from './agent-errors';

export type MutationKind = 'create' | 'update' | 'share';

export interface CreateMutationPayload {
  readonly title: string;
  readonly contentHtml: string;
}
export interface UpdateMutationPayload {
  readonly title?: string;
  readonly contentHtml?: string;
}
export interface ShareMutationPayload {
  readonly targetEmail: string;
  readonly permission: 'viewer' | 'editor';
}

export type MutationPayload =
  | CreateMutationPayload
  | UpdateMutationPayload
  | ShareMutationPayload;

interface ProposedMutationProps {
  readonly id: string;
  readonly kind: MutationKind;
  readonly targetNoteId?: string;
  readonly payload: MutationPayload;
  readonly summary: string;
  readonly previewHtml?: string;
  // Target note updatedAt as ISO string at propose time; compared via toISOString() at commit (optimistic concurrency).
  readonly baseVersion?: string;
}

export class ProposedMutation {
  readonly id: string;
  readonly kind: MutationKind;
  readonly targetNoteId?: string;
  readonly payload: MutationPayload;
  readonly summary: string;
  readonly previewHtml?: string;
  readonly baseVersion?: string;

  private constructor(props: ProposedMutationProps) {
    this.id = props.id;
    this.kind = props.kind;
    if (props.targetNoteId !== undefined) {
      this.targetNoteId = props.targetNoteId;
    }
    this.payload = props.payload;
    this.summary = props.summary;
    if (props.previewHtml !== undefined) {
      this.previewHtml = props.previewHtml;
    }
    if (props.baseVersion !== undefined) {
      this.baseVersion = props.baseVersion;
    }
    Object.freeze(this);
  }

  static create(
    props: ProposedMutationProps
  ): Result<ProposedMutation, AgentDomainError> {
    if (
      (props.kind === 'update' || props.kind === 'share') &&
      !props.targetNoteId
    ) {
      return err(
        AgentErrors.invalidProposal(`${props.kind} requires a targetNoteId`)
      );
    }
    if (!props.summary.trim()) {
      return err(AgentErrors.invalidProposal('summary is required'));
    }
    return ok(new ProposedMutation(props));
  }
}
