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

interface ProposedMutationBase {
  readonly id: string;
  readonly summary: string;
  readonly previewHtml?: string;
  // Target note updatedAt as ISO string at propose time; compared via toISOString() at commit (optimistic concurrency).
  readonly baseVersion?: string;
}

export interface CreateProposedMutation extends ProposedMutationBase {
  readonly kind: 'create';
  readonly payload: CreateMutationPayload;
}

export interface UpdateProposedMutation extends ProposedMutationBase {
  readonly kind: 'update';
  readonly targetNoteId: string;
  readonly payload: UpdateMutationPayload;
}

export interface ShareProposedMutation extends ProposedMutationBase {
  readonly kind: 'share';
  readonly targetNoteId: string;
  readonly payload: ShareMutationPayload;
}

export type ProposedMutation =
  | CreateProposedMutation
  | UpdateProposedMutation
  | ShareProposedMutation;

export interface ProposedMutationInput {
  readonly id: string;
  readonly kind: MutationKind;
  readonly targetNoteId?: string;
  readonly payload: MutationPayload;
  readonly summary: string;
  readonly previewHtml?: string;
  readonly baseVersion?: string;
}

function isCreatePayload(p: MutationPayload): p is CreateMutationPayload {
  return (
    'title' in p &&
    'contentHtml' in p &&
    typeof p.title === 'string' &&
    typeof p.contentHtml === 'string'
  );
}

function isUpdatePayload(p: MutationPayload): p is UpdateMutationPayload {
  if ('targetEmail' in p) {
    return false;
  }
  const hasTitle = 'title' in p && typeof p.title === 'string';
  const hasContent = 'contentHtml' in p && typeof p.contentHtml === 'string';
  return hasTitle || hasContent;
}

function isSharePayload(p: MutationPayload): p is ShareMutationPayload {
  return (
    'targetEmail' in p &&
    typeof p.targetEmail === 'string' &&
    (p.permission === 'viewer' || p.permission === 'editor')
  );
}

function baseProps(props: ProposedMutationInput): ProposedMutationBase {
  return {
    id: props.id,
    summary: props.summary,
    ...(props.previewHtml !== undefined && { previewHtml: props.previewHtml }),
    ...(props.baseVersion !== undefined && { baseVersion: props.baseVersion }),
  };
}

export const ProposedMutation = {
  create(
    props: ProposedMutationInput
  ): Result<ProposedMutation, AgentDomainError> {
    if (!props.id.trim()) {
      return err(AgentErrors.invalidProposal('id is required'));
    }
    if (!props.summary.trim()) {
      return err(AgentErrors.invalidProposal('summary is required'));
    }
    switch (props.kind) {
      case 'create': {
        if (!isCreatePayload(props.payload)) {
          return err(
            AgentErrors.invalidProposal(
              'create requires a title and contentHtml'
            )
          );
        }
        const mutation: CreateProposedMutation = {
          ...baseProps(props),
          kind: 'create',
          payload: Object.freeze({ ...props.payload }),
        };
        return ok(Object.freeze(mutation));
      }
      case 'update': {
        if (!props.targetNoteId) {
          return err(
            AgentErrors.invalidProposal('update requires a targetNoteId')
          );
        }
        if (!isUpdatePayload(props.payload)) {
          return err(
            AgentErrors.invalidProposal(
              'update requires a title or contentHtml change'
            )
          );
        }
        const mutation: UpdateProposedMutation = {
          ...baseProps(props),
          kind: 'update',
          targetNoteId: props.targetNoteId,
          payload: Object.freeze({ ...props.payload }),
        };
        return ok(Object.freeze(mutation));
      }
      case 'share': {
        if (!props.targetNoteId) {
          return err(
            AgentErrors.invalidProposal('share requires a targetNoteId')
          );
        }
        if (!isSharePayload(props.payload)) {
          return err(
            AgentErrors.invalidProposal(
              'share requires a targetEmail and permission'
            )
          );
        }
        const mutation: ShareProposedMutation = {
          ...baseProps(props),
          kind: 'share',
          targetNoteId: props.targetNoteId,
          payload: Object.freeze({ ...props.payload }),
        };
        return ok(Object.freeze(mutation));
      }
      default: {
        const _exhaustive: never = props.kind;
        return err(
          AgentErrors.invalidProposal(
            `unknown mutation kind: ${String(_exhaustive)}`
          )
        );
      }
    }
  },
} as const;
