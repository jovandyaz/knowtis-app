import type { McpScopeLevel } from '@knowtis/shared-types';

export class McpKeyCreatedEvent {
  static readonly EVENT_NAME = 'mcp.key.created';

  constructor(
    public readonly userId: string,
    public readonly scopeLevel: McpScopeLevel
  ) {}
}
