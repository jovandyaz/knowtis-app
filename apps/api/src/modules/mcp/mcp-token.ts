export const TOKEN_SOURCE_MCP = 'mcp';

export interface McpTokenClaims {
  source?: string;
  scopes?: string;
}
