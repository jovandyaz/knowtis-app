import type { AgentEvent } from '../agent-event';
import type { AgentMessage } from '../agent-message';

export interface AgentResumeContext {
  readonly toolName: string;
  readonly outcome: string;
}

export interface AgentRunInput {
  readonly userId: string;
  readonly messages: readonly AgentMessage[];
  readonly model: string;
  readonly maxSteps: number;
  readonly noteId?: string;
  readonly signal?: AbortSignal;
  readonly resume?: AgentResumeContext;
}

export interface AgentOrchestrator {
  run(input: AgentRunInput): AsyncIterable<AgentEvent>;
}

export const AGENT_ORCHESTRATOR = Symbol('AGENT_ORCHESTRATOR');
