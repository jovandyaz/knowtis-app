export type McpScopeLevel = 'read' | 'write' | 'share';

export class McpKeyCreatedEvent {
  static readonly EVENT_NAME = 'mcp.key.created';

  constructor(
    public readonly userId: string,
    public readonly scopeLevel: McpScopeLevel
  ) {}
}
