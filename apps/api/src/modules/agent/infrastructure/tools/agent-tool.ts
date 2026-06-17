import type { ToolSet } from 'ai';

import type { FeatureFlagKey } from '@knowtis/shared-types';

import type { ProposalCollector } from '../orchestrator/proposal-collector';
import type { WebSourceCollector } from '../orchestrator/web-source.collector';

export type AgentToolPhase = 'full' | 'readonly';

export interface AgentToolContext {
  readonly userId: string;
  readonly phase: AgentToolPhase;
  readonly proposals: ProposalCollector;
  readonly webSources: WebSourceCollector;
}

export interface AgentToolGroup {
  readonly name: string;
  readonly flag?: FeatureFlagKey;
  availableIn(phase: AgentToolPhase): boolean;
  build(ctx: AgentToolContext): ToolSet;
}

export const AGENT_TOOL_GROUPS = Symbol('AGENT_TOOL_GROUPS');
