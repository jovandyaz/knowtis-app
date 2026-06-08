import type { AIDomainError } from '../../ai/domain/errors/ai.errors';
import type { ProposedMutation } from './proposed-mutation';

export interface AgentTurnUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly model: string;
}

export interface AgentSource {
  readonly id: string;
  readonly title: string;
}

export interface AgentCommitResult {
  readonly noteId: string;
  readonly title: string;
  readonly kind: 'create' | 'update' | 'share';
}

export type AgentEvent =
  | { readonly type: 'chunk'; readonly text: string }
  | {
      readonly type: 'done';
      readonly usage: AgentTurnUsage;
      readonly sources: readonly AgentSource[];
    }
  | { readonly type: 'proposal'; readonly proposal: ProposedMutation }
  | { readonly type: 'committed'; readonly result: AgentCommitResult }
  | {
      readonly type: 'error';
      readonly error: AIDomainError | { code: string; message: string };
    };
