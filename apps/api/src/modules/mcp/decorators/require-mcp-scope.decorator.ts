import { SetMetadata } from '@nestjs/common';

export const MCP_SCOPE_KEY = 'mcp_scope';
export const RequireMcpScope = (scope: string) =>
  SetMetadata(MCP_SCOPE_KEY, scope);
