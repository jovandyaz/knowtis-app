import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NoteResponse, NotesApi } from '../api-client/notes.api.js';
import type { AuthService } from '../auth/auth-service.js';
import { registerNotesTools } from '../tools/notes.tools.js';

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

function createMockNotesApi(overrides: Partial<NotesApi> = {}): NotesApi {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as NotesApi;
}

const TEST_API_KEY = 'knowtis_mcp_test_abcdefghijklmnopqrstuvwxyz';

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const MUTATING_IDEMPOTENT = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

describe('registerNotesTools', () => {
  let notesApi: NotesApi;
  let authService: AuthService;

  beforeEach(() => {
    notesApi = createMockNotesApi();
    authService = createMockAuthService();
  });

  it('should register all five notes tools via registerTool', () => {
    const { server, tools } = createFakeServer();

    registerNotesTools(server, notesApi, authService, TEST_API_KEY);

    expect([...tools.keys()].sort()).toEqual([
      'create-note',
      'delete-note',
      'get-note',
      'list-notes',
      'update-note',
    ]);
  });

  it('should annotate delete-note as destructive and get/list as read-only', () => {
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, authService, TEST_API_KEY);

    expect(tools.get('delete-note')!.config.annotations).toEqual(
      MUTATING_IDEMPOTENT
    );
    expect(tools.get('list-notes')!.config.annotations).toEqual(READ_ONLY);
    expect(tools.get('get-note')!.config.annotations).toEqual(READ_ONLY);
    expect(tools.get('get-note')!.config.title).toBe('Get Note');
    expect(tools.get('get-note')!.config.outputSchema).toBeDefined();
  });

  it('should annotate update-note as destructive-idempotent and create-note as non-idempotent', () => {
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, authService, TEST_API_KEY);

    expect(tools.get('update-note')!.config.annotations).toEqual(
      MUTATING_IDEMPOTENT
    );
    expect(tools.get('create-note')!.config.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    });
  });

  it('should set titles and output schemas on every tool', () => {
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, authService, TEST_API_KEY);

    expect(tools.get('list-notes')!.config.title).toBe('List Notes');
    expect(tools.get('create-note')!.config.title).toBe('Create Note');
    expect(tools.get('update-note')!.config.title).toBe('Update Note');
    expect(tools.get('delete-note')!.config.title).toBe('Delete Note');

    for (const name of tools.keys()) {
      expect(tools.get(name)!.config.outputSchema).toBeDefined();
    }
  });

  it('should keep tool descriptions verbatim', () => {
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, authService, TEST_API_KEY);

    expect(tools.get('list-notes')!.config.description).toBe(
      "List user's notes with optional search filter. Returns title, id, and last modified date."
    );
    expect(tools.get('delete-note')!.config.description).toBe(
      'Permanently delete a note. This action cannot be undone.'
    );
  });

  it('should return notes narrowed to id/title/updatedAt from list-notes handler', async () => {
    const fullNote: NoteResponse = {
      id: 'note-1',
      title: 'My Note',
      content: '<p>secret body</p>',
      ownerId: 'owner-9',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    notesApi = createMockNotesApi({
      list: vi.fn().mockResolvedValue([fullNote]),
    });
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, authService, TEST_API_KEY);

    const result = await tools.get('list-notes')!.cb({ search: 'my' });

    expect(notesApi.list).toHaveBeenCalledWith('jwt-token-123', 'my');
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      notes: [
        {
          id: 'note-1',
          title: 'My Note',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    });
  });
});
