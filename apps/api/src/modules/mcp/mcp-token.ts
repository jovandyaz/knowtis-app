export const TOKEN_SOURCE_MCP = 'mcp';

export const MCP_SCOPES = {
  READ: 'notes:read',
  WRITE: 'notes:write',
  SHARE: 'notes:share',
} as const;

export type McpScope = (typeof MCP_SCOPES)[keyof typeof MCP_SCOPES];

export const MCP_SCOPE_CSVS = [
  MCP_SCOPES.READ,
  `${MCP_SCOPES.READ},${MCP_SCOPES.WRITE}`,
  `${MCP_SCOPES.READ},${MCP_SCOPES.WRITE},${MCP_SCOPES.SHARE}`,
] as const;

export type McpScopeCsv = (typeof MCP_SCOPE_CSVS)[number];

export interface McpTokenClaims {
  source?: string;
  scopes?: string;
}
