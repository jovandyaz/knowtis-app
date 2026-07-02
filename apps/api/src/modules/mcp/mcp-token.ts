export const TOKEN_SOURCE_MCP = 'mcp';

export const MCP_SCOPES = {
  READ: 'notes:read',
  WRITE: 'notes:write',
  SHARE: 'notes:share',
} as const;

export type McpScope = (typeof MCP_SCOPES)[keyof typeof MCP_SCOPES];

export interface McpTokenClaims {
  source?: string;
  scopes?: string;
}
