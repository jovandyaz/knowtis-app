import { httpClient } from './http-client';

/**
 * MCP API key as returned by the list endpoint
 */
export interface McpApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

/**
 * Input for creating a new MCP API key
 */
export interface CreateMcpKeyInput {
  name: string;
  scopes?: string;
}

/**
 * Response after creating a new MCP API key (includes the full key, shown only once)
 */
export interface CreateMcpKeyResponse {
  key: string;
  prefix: string;
  name: string;
  scopes: string;
}

export const mcpKeysApi = {
  /**
   * List all MCP API keys for the current user
   */
  async getAll(): Promise<McpApiKey[]> {
    return httpClient.get<McpApiKey[]>('/mcp/keys');
  },

  /**
   * Create a new MCP API key
   */
  async create(input: CreateMcpKeyInput): Promise<CreateMcpKeyResponse> {
    return httpClient.post<CreateMcpKeyResponse>('/mcp/keys', input);
  },

  /**
   * Revoke (delete) an MCP API key
   */
  async revoke(id: string): Promise<void> {
    await httpClient.delete(`/mcp/keys/${id}`);
  },
};
