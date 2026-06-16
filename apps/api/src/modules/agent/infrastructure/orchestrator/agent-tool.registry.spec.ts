import type { ToolSet } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import type { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import type {
  AgentToolContext,
  AgentToolGroup,
  AgentToolPhase,
} from '../tools/agent-tool';
import { AgentToolRegistry } from './agent-tool.registry';
import { ProposalCollector } from './proposal-collector';
import { WebSourceCollector } from './web-source.collector';

const fakeTool = (n: string) => ({ [n]: { description: n } }) as ToolSet;

function group(
  name: string,
  opts: { flag?: string; phases: AgentToolPhase[] }
): AgentToolGroup {
  return {
    name,
    ...(opts.flag ? { flag: opts.flag } : {}),
    availableIn: (p) => opts.phases.includes(p),
    build: () => fakeTool(name),
  };
}

function ctx(phase: AgentToolPhase): AgentToolContext {
  return {
    userId: 'u1',
    phase,
    proposals: new ProposalCollector(),
    webSources: new WebSourceCollector(),
  };
}

describe('AgentToolRegistry', () => {
  it('should exclude groups not available in the phase', async () => {
    const flags = { isEnabled: vi.fn() } as unknown as FeatureFlagsService;
    const registry = new AgentToolRegistry(
      [
        group('read', { phases: ['full', 'readonly'] }),
        group('mutate', { phases: ['full'] }),
      ],
      flags
    );
    const tools = await registry.resolve(ctx('readonly'));
    expect(Object.keys(tools)).toEqual(['read']);
  });

  it('should omit a flag-gated group when its flag is disabled', async () => {
    const flags = {
      isEnabled: vi.fn().mockResolvedValue(false),
    } as unknown as FeatureFlagsService;
    const registry = new AgentToolRegistry(
      [group('web', { flag: 'agent_web_search', phases: ['full'] })],
      flags
    );
    expect(Object.keys(await registry.resolve(ctx('full')))).toEqual([]);
    expect(flags.isEnabled).toHaveBeenCalledWith('agent_web_search');
  });

  it('should include a flag-gated group when its flag is enabled', async () => {
    const flags = {
      isEnabled: vi.fn().mockResolvedValue(true),
    } as unknown as FeatureFlagsService;
    const registry = new AgentToolRegistry(
      [group('web', { flag: 'agent_web_search', phases: ['full'] })],
      flags
    );
    expect(Object.keys(await registry.resolve(ctx('full')))).toEqual(['web']);
  });
});
