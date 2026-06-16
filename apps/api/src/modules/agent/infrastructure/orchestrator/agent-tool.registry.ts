import { Inject, Injectable } from '@nestjs/common';
import type { ToolSet } from 'ai';

import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import {
  AGENT_TOOL_GROUPS,
  type AgentToolContext,
  type AgentToolGroup,
} from '../tools/agent-tool';

@Injectable()
export class AgentToolRegistry {
  constructor(
    @Inject(AGENT_TOOL_GROUPS)
    private readonly groups: readonly AgentToolGroup[],
    private readonly flags: FeatureFlagsService
  ) {}

  async resolve(ctx: AgentToolContext): Promise<ToolSet> {
    const available = this.groups.filter((g) => g.availableIn(ctx.phase));
    const built = await Promise.all(
      available.map(async (g) =>
        g.flag && !(await this.flags.isEnabled(g.flag)) ? null : g.build(ctx)
      )
    );
    return Object.assign({}, ...built.filter((t): t is ToolSet => t !== null));
  }
}
