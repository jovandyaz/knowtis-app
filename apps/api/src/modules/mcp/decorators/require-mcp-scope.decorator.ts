import { SetMetadata } from '@nestjs/common';

import type { McpScope } from '../mcp-token';

export const MCP_SCOPE_KEY = 'mcp_scope';
export const RequireMcpScope = (scope: McpScope) =>
  SetMetadata(MCP_SCOPE_KEY, scope);

export const MCP_BODY_FIELDS_SCOPE_KEY = 'mcp_body_fields_scope';

export interface McpBodyFieldsScope {
  readonly scope: McpScope;
  readonly fields: readonly string[];
}

/** Also demands `scope` of an MCP token whose request body carries any of `fields`, for a route where some fields reach further than the route's own scope. Guards run before interceptors, so it cannot see a body an interceptor parses, such as multipart. */
export const RequireMcpScopeForBodyFields = (
  scope: McpScope,
  fields: readonly string[]
) =>
  SetMetadata(MCP_BODY_FIELDS_SCOPE_KEY, {
    scope,
    fields,
  } satisfies McpBodyFieldsScope);
