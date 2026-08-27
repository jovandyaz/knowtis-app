import type { AIDomainError } from '../../ai/domain/errors/ai.errors';
import type { ProposedMutation } from './proposed-mutation';

export interface AgentTurnUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly model: string;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
}

export interface AgentSource {
  readonly id: string;
  readonly title: string;
}

export interface WebSource {
  readonly title: string;
  readonly url: string;
}

export interface AgentCommitResult {
  readonly noteId: string;
  readonly title: string;
  readonly kind: 'create' | 'update' | 'share';
}

export const AGENT_STOP_REASON = {
  COMPLETED: 'completed',
  MAX_STEPS: 'max_steps',
  LENGTH: 'length',
  TOKEN_BUDGET: 'token_budget',
} as const;
export type AgentStopReason =
  (typeof AGENT_STOP_REASON)[keyof typeof AGENT_STOP_REASON];

export type AgentEvent =
  | { readonly type: 'thinking'; readonly text: string }
  | { readonly type: 'chunk'; readonly text: string }
  | {
      readonly type: 'done';
      readonly usage: AgentTurnUsage;
      readonly sources: readonly AgentSource[];
      readonly knownNotes: readonly AgentSource[];
      readonly webSources: readonly WebSource[];
      readonly stopReason: AgentStopReason;
    }
  | {
      readonly type: 'proposal';
      readonly proposal: ProposedMutation;
      readonly usage: AgentTurnUsage;
    }
  | { readonly type: 'committed'; readonly result: AgentCommitResult }
  | { readonly type: 'aborted'; readonly usage: AgentTurnUsage }
  | {
      readonly type: 'error';
      readonly error: AIDomainError | { code: string; message: string };
      readonly usage?: AgentTurnUsage;
    };
