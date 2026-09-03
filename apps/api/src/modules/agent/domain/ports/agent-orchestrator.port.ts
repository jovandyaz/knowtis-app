import type { ReasoningEffort } from '@knowtis/shared-types';

import type { AgentEvent, AgentSource } from '../agent-event';
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
  readonly maxTurnTokens: number;
  readonly noteId?: string;
  readonly signal?: AbortSignal;
  readonly resume?: AgentResumeContext;
  readonly knownNotes?: readonly AgentSource[];
  readonly userMemories?: readonly string[];
  readonly byokApiKey?: string;
  /** Effort for the model about to be served; awaited again on every failover so a rescue model is never handed another model's level. */
  readonly effortFor?: (model: string) => Promise<ReasoningEffort | undefined>;
  readonly openrouterProviderOrder?: readonly string[];
}

export interface AgentOrchestrator {
  run(input: AgentRunInput): AsyncIterable<AgentEvent>;
}

export const AGENT_ORCHESTRATOR = Symbol('AGENT_ORCHESTRATOR');
