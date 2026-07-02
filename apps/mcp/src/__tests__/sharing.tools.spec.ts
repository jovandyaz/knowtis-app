import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Collaborator, SharingApi } from '../api-client/sharing.api.js';
import type { AuthService } from '../auth/auth-service.js';
import { registerSharingTools } from '../tools/sharing.tools.js';

interface RegisteredToolEntry {
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

function createFakeServer() {
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

function createMockAuthService(
  overrides: Partial<AuthService> = {}
): AuthService {
  return {
    getToken: vi.fn().mockResolvedValue('jwt-token-123'),
    checkScope: vi.fn(),
    ...overrides,
  } as unknown as AuthService;
}

function createMockSharingApi(overrides: Partial<SharingApi> = {}): SharingApi {
  return {
    getCollaborators: vi.fn().mockResolvedValue([]),
    share: vi.fn(),
    ...overrides,
  } as unknown as SharingApi;
}

const TEST_API_KEY = 'knowtis_mcp_test_abcdefghijklmnopqrstuvwxyz';

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const MUTATING_NON_DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

describe('registerSharingTools', () => {
  let sharingApi: SharingApi;
  let authService: AuthService;

  beforeEach(() => {
    sharingApi = createMockSharingApi();
    authService = createMockAuthService();
  });

  it('should register both sharing tools via registerTool', () => {
    const { server, tools } = createFakeServer();

    registerSharingTools(server, sharingApi, authService, TEST_API_KEY);

    expect([...tools.keys()].sort()).toEqual([
      'get-collaborators',
      'share-note',
    ]);
  });

  it('should annotate get-collaborators as read-only and share-note as mutating non-destructive', () => {
    const { server, tools } = createFakeServer();
    registerSharingTools(server, sharingApi, authService, TEST_API_KEY);

    expect(tools.get('get-collaborators')!.config.annotations).toEqual(
      READ_ONLY
    );
    expect(tools.get('share-note')!.config.annotations).toEqual(
      MUTATING_NON_DESTRUCTIVE
    );
  });

  it('should set titles and output schemas on every tool', () => {
    const { server, tools } = createFakeServer();
    registerSharingTools(server, sharingApi, authService, TEST_API_KEY);

    expect(tools.get('get-collaborators')!.config.title).toBe(
      'Get Collaborators'
    );
    expect(tools.get('share-note')!.config.title).toBe('Share Note');

    for (const name of tools.keys()) {
      expect(tools.get(name)!.config.outputSchema).toBeDefined();
    }
  });

  it('should keep tool descriptions verbatim', () => {
    const { server, tools } = createFakeServer();
    registerSharingTools(server, sharingApi, authService, TEST_API_KEY);

    expect(tools.get('get-collaborators')!.config.description).toBe(
      'List who has access to a note and their permission level (owner, editor, viewer).'
    );
    expect(tools.get('share-note')!.config.description).toBe(
      'Share a note with another user by their user ID.'
    );
  });

  it('should return collaborators from the get-collaborators handler', async () => {
    const collaborators: Collaborator[] = [
      {
        userId: 'user-1',
        email: 'user1@example.com',
        name: 'User One',
        permission: 'editor',
      },
    ];
    sharingApi = createMockSharingApi({
      getCollaborators: vi.fn().mockResolvedValue(collaborators),
    });
    const { server, tools } = createFakeServer();
    registerSharingTools(server, sharingApi, authService, TEST_API_KEY);

    const result = await tools
      .get('get-collaborators')!
      .cb({ noteId: 'note-1' });

    expect(sharingApi.getCollaborators).toHaveBeenCalledWith(
      'jwt-token-123',
      'note-1'
    );
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ collaborators });
  });
});
