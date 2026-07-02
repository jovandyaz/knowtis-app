import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { vi } from 'vitest';

import type { AuthService } from '../auth/auth-service.js';

export interface RegisteredToolEntry {
  config: {
    title?: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
  };
  cb: (args: Record<string, unknown>) => Promise<{
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
    content: Array<{ type: 'text'; text: string }>;
  }>;
}

export function createFakeServer() {
  const tools = new Map<string, RegisteredToolEntry>();
  const server = {
    registerTool: (
      name: string,
      config: RegisteredToolEntry['config'],
      cb: RegisteredToolEntry['cb']
    ) => {
      tools.set(name, { config, cb });
    },
  } as unknown as McpServer;
  return { server, tools };
}

export function createMockAuthService(
  overrides: Partial<AuthService> = {}
): AuthService {
  return {
    getToken: vi.fn().mockResolvedValue('jwt-token-123'),
    checkScope: vi.fn(),
    ...overrides,
  } as unknown as AuthService;
}

export function getTool(
  tools: Map<string, RegisteredToolEntry>,
  name: string
): RegisteredToolEntry {
  const entry = tools.get(name);
  if (!entry) {
    throw new Error(`Tool not registered: ${name}`);
  }
  return entry;
}

export const TEST_API_KEY = 'knowtis_mcp_test_abcdefghijklmnopqrstuvwxyz';
