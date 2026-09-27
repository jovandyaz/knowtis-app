import type { ToolSet } from 'ai';

import type { AiExecutionContext } from '../../../ai/domain/execution-context/ai-execution-context';
import type { ProposalCollector } from '../orchestrator/proposal-collector';
import type { WebFetchAllowlist } from '../orchestrator/web-fetch-allowlist';
import type { WebSourceCollector } from '../orchestrator/web-source.collector';

export type AgentToolPhase = 'full' | 'readonly';

export interface AgentToolContext {
  readonly userId: string;
  readonly phase: AgentToolPhase;
  readonly execution: AiExecutionContext;
  readonly proposals: ProposalCollector;
  readonly webSources: WebSourceCollector;
  readonly webFetchAllowlist: WebFetchAllowlist;
}

export interface AgentToolGroup {
  readonly name: string;
  availableIn(phase: AgentToolPhase): boolean;
  build(ctx: AgentToolContext): ToolSet;
}

export const AGENT_TOOL_GROUPS = Symbol('AGENT_TOOL_GROUPS');
