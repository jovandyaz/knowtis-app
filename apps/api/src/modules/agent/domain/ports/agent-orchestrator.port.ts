import type { AiExecutionContext } from '../../../ai/domain/execution-context/ai-execution-context';
import type { TurnEffort } from '../../../ai/domain/model-catalog/effort-policy';
import type { AgentEvent, AgentSource } from '../agent-event';
import type { AgentMessage } from '../agent-message';

export interface AgentResumeContext {
  readonly outcome: string;
}

export interface AgentRunInput {
  /** The turn's billed context; the tools' side costs are charged to it. */
  readonly execution: AiExecutionContext;
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
  /** Efforts for the model about to be served, within its own ladder; awaited again on every failover so a rescue model is never handed another model's levels. */
  readonly effortFor?: (model: string) => Promise<TurnEffort | undefined>;
  readonly openrouterProviderOrder?: readonly string[];
  readonly openrouterIgnoredProviders?: readonly string[];
}

export interface AgentOrchestrator {
  run(input: AgentRunInput): AsyncIterable<AgentEvent>;
}

export const AGENT_ORCHESTRATOR = Symbol('AGENT_ORCHESTRATOR');
