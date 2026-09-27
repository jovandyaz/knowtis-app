import type { ToolSet } from 'ai';
import { describe, expect, it } from 'vitest';

import type {
  AgentToolContext,
  AgentToolGroup,
  AgentToolPhase,
} from '../tools/agent-tool';
import { AgentToolRegistry } from './agent-tool.registry';
import { ProposalCollector } from './proposal-collector';
import { WebFetchAllowlist } from './web-fetch-allowlist';
import { WebSourceCollector } from './web-source.collector';

const fakeTool = (n: string) => ({ [n]: { description: n } }) as ToolSet;

function group(
  name: string,
  opts: { phases: AgentToolPhase[]; toolName?: string }
): AgentToolGroup {
  return {
    name,
    availableIn: (p) => opts.phases.includes(p),
    build: () => fakeTool(opts.toolName ?? name),
  };
}

function ctx(phase: AgentToolPhase): AgentToolContext {
  return {
    userId: 'u1',
    phase,
    byokTurn: false,
    proposals: new ProposalCollector(),
    webSources: new WebSourceCollector(),
    webFetchAllowlist: new WebFetchAllowlist(),
  };
}

describe('AgentToolRegistry', () => {
  it('should exclude groups not available in the phase', () => {
    const registry = new AgentToolRegistry([
      group('read', { phases: ['full', 'readonly'] }),
      group('mutate', { phases: ['full'] }),
    ]);
    const tools = registry.resolve(ctx('readonly'));
    expect(Object.keys(tools)).toEqual(['read']);
  });

  it('should include a group available in the phase', () => {
    const registry = new AgentToolRegistry([
      group('web', { phases: ['full'] }),
    ]);
    expect(Object.keys(registry.resolve(ctx('full')))).toEqual(['web']);
  });

  it('should throw when two groups expose the same tool name', () => {
    const registry = new AgentToolRegistry([
      group('groupA', { phases: ['full'], toolName: 'shared' }),
      group('groupB', { phases: ['full'], toolName: 'shared' }),
    ]);
    expect(() => registry.resolve(ctx('full'))).toThrow(
      /Duplicate agent tool name: shared/
    );
  });
});
