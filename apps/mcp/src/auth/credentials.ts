export type McpCredential =
  | { kind: 'api-key'; apiKey: string }
  | { kind: 'oauth'; jwt: string; scopes: string[] };

export function classifyBearer(token: string): 'api-key' | 'oauth' {
  return token.startsWith('knowtis_mcp_') ? 'api-key' : 'oauth';
}
