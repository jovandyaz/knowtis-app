import { SetMetadata } from '@nestjs/common';

import type { McpScope } from '../mcp-token';

export const MCP_SCOPE_KEY = 'mcp_scope';
export const RequireMcpScope = (scope: McpScope) =>
  SetMetadata(MCP_SCOPE_KEY, scope);
