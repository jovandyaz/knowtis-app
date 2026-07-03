import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NoteResponse, NotesApi } from '../api-client/notes.api.js';
import type { AuthService } from '../auth/auth-service.js';
import type { McpCredential } from '../auth/credentials.js';
import { registerNotesTools } from '../tools/notes.tools.js';
import {
  createFakeServer,
  createMockAuthService,
  getTool,
  TEST_API_KEY,
} from './test-utils.js';

const CREDENTIAL: McpCredential = { kind: 'api-key', apiKey: TEST_API_KEY };

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

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const DESTRUCTIVE_IDEMPOTENT = {
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

    registerNotesTools(server, notesApi, authService, CREDENTIAL);

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
    registerNotesTools(server, notesApi, authService, CREDENTIAL);

    expect(getTool(tools, 'delete-note').config.annotations).toEqual(
      DESTRUCTIVE_IDEMPOTENT
    );
    expect(getTool(tools, 'list-notes').config.annotations).toEqual(READ_ONLY);
    expect(getTool(tools, 'get-note').config.annotations).toEqual(READ_ONLY);
    expect(getTool(tools, 'get-note').config.title).toBe('Get Note');
  });

  it('should annotate update-note as destructive-idempotent and create-note as non-idempotent', () => {
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, authService, CREDENTIAL);

    expect(getTool(tools, 'update-note').config.annotations).toEqual(
      DESTRUCTIVE_IDEMPOTENT
    );
    expect(getTool(tools, 'create-note').config.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    });
  });

  it('should set titles and expected output-schema shapes on every tool', () => {
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, authService, CREDENTIAL);

    expect(getTool(tools, 'list-notes').config.title).toBe('List Notes');
    expect(getTool(tools, 'create-note').config.title).toBe('Create Note');
    expect(getTool(tools, 'update-note').config.title).toBe('Update Note');
    expect(getTool(tools, 'delete-note').config.title).toBe('Delete Note');

    const expectedOutputKeys: Record<string, string[]> = {
      'list-notes': ['notes'],
      'get-note': ['note'],
      'create-note': ['note'],
      'update-note': ['note'],
      'delete-note': ['success', 'message'],
    };
    for (const [name, keys] of Object.entries(expectedOutputKeys)) {
      expect(
        Object.keys(getTool(tools, name).config.outputSchema ?? {})
      ).toEqual(keys);
    }
  });

  it('should keep tool descriptions verbatim', () => {
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, authService, CREDENTIAL);

    expect(getTool(tools, 'list-notes').config.description).toBe(
      "List user's notes with optional search filter. Returns title, id, and last modified date."
    );
    expect(getTool(tools, 'delete-note').config.description).toBe(
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
    registerNotesTools(server, notesApi, authService, CREDENTIAL);

    const result = await getTool(tools, 'list-notes').cb({ search: 'my' });

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

  it('should confirm deletion from the delete-note handler', async () => {
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, authService, CREDENTIAL);

    const result = await getTool(tools, 'delete-note').cb({ noteId: 'note-1' });

    expect(notesApi.delete).toHaveBeenCalledWith('jwt-token-123', 'note-1');
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      success: true,
      message: 'Note deleted.',
    });
  });

  it('should surface API failures as isError results', async () => {
    notesApi = createMockNotesApi({
      list: vi.fn().mockRejectedValue(new Error('upstream exploded')),
    });
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, authService, CREDENTIAL);

    const result = await getTool(tools, 'list-notes').cb({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('upstream exploded');
    expect(result.structuredContent).toBeUndefined();
  });

  it('should surface auth failures as isError results', async () => {
    authService = createMockAuthService({
      getToken: vi
        .fn()
        .mockRejectedValue(new Error('Authentication failed: key revoked')),
    });
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, authService, CREDENTIAL);

    const result = await getTool(tools, 'get-note').cb({ noteId: 'note-1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Authentication failed: key revoked');
    expect(notesApi.get).not.toHaveBeenCalled();
  });
});
