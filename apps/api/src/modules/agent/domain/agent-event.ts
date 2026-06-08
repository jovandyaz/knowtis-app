import type { AIDomainError } from '../../ai/domain/errors/ai.errors';

export interface AgentTurnUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly model: string;
}

export interface AgentSource {
  readonly id: string;
  readonly title: string;
}

export type AgentEvent =
  | { readonly type: 'chunk'; readonly text: string }
  | {
      readonly type: 'done';
      readonly usage: AgentTurnUsage;
      readonly sources: readonly AgentSource[];
    }
  | { readonly type: 'error'; readonly error: AIDomainError };
