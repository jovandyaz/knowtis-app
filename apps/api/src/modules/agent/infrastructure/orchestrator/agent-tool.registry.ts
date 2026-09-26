import { Inject, Injectable } from '@nestjs/common';
import type { ToolSet } from 'ai';

import {
  AGENT_TOOL_GROUPS,
  type AgentToolContext,
  type AgentToolGroup,
} from '../tools/agent-tool';

@Injectable()
export class AgentToolRegistry {
  constructor(
    @Inject(AGENT_TOOL_GROUPS)
    private readonly groups: readonly AgentToolGroup[]
  ) {}

  resolve(ctx: AgentToolContext): ToolSet {
    const available = this.groups.filter((g) => g.availableIn(ctx.phase));
    const built = available.map((g) => g.build(ctx));
    const merged: ToolSet = {};
    for (const toolSet of built) {
      for (const [name, definition] of Object.entries(toolSet)) {
        if (name in merged) {
          throw new Error(`Duplicate agent tool name: ${name}`);
        }
        merged[name] = definition;
      }
    }
    return merged;
  }
}
