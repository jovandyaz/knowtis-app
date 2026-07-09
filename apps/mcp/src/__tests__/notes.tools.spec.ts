import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NoteResponse, NotesApi } from '../api-client/notes.api.js';
import type { SearchApi, SearchHit } from '../api-client/search.api.js';
import { AuthService } from '../auth/auth-service.js';
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

function createMockSearchApi(overrides: Partial<SearchApi> = {}): SearchApi {
  return {
    search: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as SearchApi;
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
  let searchApi: SearchApi;
  let authService: AuthService;

  beforeEach(() => {
    notesApi = createMockNotesApi();
    searchApi = createMockSearchApi();
    authService = createMockAuthService();
  });

  it('should register all six notes tools via registerTool', () => {
    const { server, tools } = createFakeServer();

    registerNotesTools(server, notesApi, searchApi, authService, CREDENTIAL);

    expect([...tools.keys()].sort()).toEqual([
      'create-note',
      'delete-note',
      'get-note',
      'list-notes',
      'search-notes',
      'update-note',
    ]);
  });

  it('should annotate delete-note as destructive and get/list as read-only', () => {
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, searchApi, authService, CREDENTIAL);

    expect(getTool(tools, 'delete-note').config.annotations).toEqual(
      DESTRUCTIVE_IDEMPOTENT
    );
    expect(getTool(tools, 'list-notes').config.annotations).toEqual(READ_ONLY);
    expect(getTool(tools, 'get-note').config.annotations).toEqual(READ_ONLY);
    expect(getTool(tools, 'get-note').config.title).toBe('Get Note');
  });

  it('should annotate update-note as destructive-idempotent and create-note as non-idempotent', () => {
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, searchApi, authService, CREDENTIAL);

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
    registerNotesTools(server, notesApi, searchApi, authService, CREDENTIAL);

    expect(getTool(tools, 'list-notes').config.title).toBe('List Notes');
    expect(getTool(tools, 'create-note').config.title).toBe('Create Note');
    expect(getTool(tools, 'update-note').config.title).toBe('Update Note');
    expect(getTool(tools, 'delete-note').config.title).toBe('Delete Note');

    const expectedOutputKeys: Record<string, string[]> = {
      'list-notes': ['notes', 'nextCursor'],
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
    registerNotesTools(server, notesApi, searchApi, authService, CREDENTIAL);

    expect(getTool(tools, 'list-notes').config.description).toBe(
      "List user's notes ordered by recency. Use cursor from a previous " +
        'call to fetch the next page; prefer search-notes for content lookup.'
    );
    expect(getTool(tools, 'delete-note').config.description).toBe(
      'Permanently delete a note. This action cannot be undone.'
    );
    expect(getTool(tools, 'get-note').config.description).toContain(
      'Content is returned as Markdown.'
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
    registerNotesTools(server, notesApi, searchApi, authService, CREDENTIAL);

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

  it('should paginate list-notes and expose nextCursor', async () => {
    const note = (id: string, updatedAt: string): NoteResponse => ({
      id,
      title: `Note ${id}`,
      content: `<p>${id}</p>`,
      ownerId: 'owner-9',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt,
    });
    const upstream = [
      note('note-1', '2026-01-01T00:00:00.000Z'),
      note('note-2', '2026-01-02T00:00:00.000Z'),
      note('note-3', '2026-01-03T00:00:00.000Z'),
    ];
    notesApi = createMockNotesApi({
      list: vi.fn().mockResolvedValue(upstream),
    });
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, searchApi, authService, CREDENTIAL);

    const page1 = await getTool(tools, 'list-notes').cb({ limit: 2 });

    expect(page1.isError).toBeUndefined();
    expect(page1.structuredContent?.notes).toEqual([
      {
        id: 'note-3',
        title: 'Note note-3',
        updatedAt: '2026-01-03T00:00:00.000Z',
      },
      {
        id: 'note-2',
        title: 'Note note-2',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
    const nextCursor = page1.structuredContent?.nextCursor;
    expect(typeof nextCursor).toBe('string');

    const page2 = await getTool(tools, 'list-notes').cb({
      limit: 2,
      cursor: nextCursor,
    });

    expect(page2.isError).toBeUndefined();
    expect(page2.structuredContent?.notes).toEqual([
      {
        id: 'note-1',
        title: 'Note note-1',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(page2.structuredContent?.nextCursor).toBeUndefined();
  });

  it('should return note content as Markdown from the get-note handler', async () => {
    const fullNote: NoteResponse = {
      id: 'note-1',
      title: 'My Note',
      content: '<p>secret body</p>',
      ownerId: 'owner-9',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    notesApi = createMockNotesApi({
      get: vi.fn().mockResolvedValue(fullNote),
    });
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, searchApi, authService, CREDENTIAL);

    const result = await getTool(tools, 'get-note').cb({ noteId: 'note-1' });

    expect(notesApi.get).toHaveBeenCalledWith('jwt-token-123', 'note-1');
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      note: { ...fullNote, content: 'secret body' },
    });
  });

  it('should convert rich HTML to Markdown in get-note content', async () => {
    const fullNote: NoteResponse = {
      id: 'note-1',
      title: 'Plan Note',
      content:
        '<h2>Plan</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>item</p></li></ul>',
      ownerId: 'owner-9',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    notesApi = createMockNotesApi({
      get: vi.fn().mockResolvedValue(fullNote),
    });
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, searchApi, authService, CREDENTIAL);

    const result = await getTool(tools, 'get-note').cb({ noteId: 'note-1' });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      note: { content: expect.stringContaining('## Plan') },
    });
    expect(result.structuredContent).toMatchObject({
      note: { content: expect.stringContaining('- [ ] item') },
    });
  });

  it('should return created note content as Markdown from the create-note handler', async () => {
    const createdNote: NoteResponse = {
      id: 'note-2',
      title: 'T',
      content: '<h2>T</h2><p>b</p>',
      ownerId: 'owner-9',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    notesApi = createMockNotesApi({
      create: vi.fn().mockResolvedValue(createdNote),
    });
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, searchApi, authService, CREDENTIAL);

    const result = await getTool(tools, 'create-note').cb({
      title: 'T',
      content: '## T\n\nb',
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      note: { ...createdNote, content: '## T\n\nb' },
    });
  });

  it('should return updated note content as Markdown from the update-note handler', async () => {
    const updatedNote: NoteResponse = {
      id: 'note-3',
      title: 'T',
      content: '<h2>T</h2><p>b</p>',
      ownerId: 'owner-9',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    notesApi = createMockNotesApi({
      update: vi.fn().mockResolvedValue(updatedNote),
    });
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, searchApi, authService, CREDENTIAL);

    const result = await getTool(tools, 'update-note').cb({
      noteId: 'note-3',
      content: '## T\n\nb',
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      note: { ...updatedNote, content: '## T\n\nb' },
    });
  });

  it('should confirm deletion from the delete-note handler', async () => {
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, searchApi, authService, CREDENTIAL);

    const result = await getTool(tools, 'delete-note').cb({ noteId: 'note-1' });

    expect(notesApi.delete).toHaveBeenCalledWith('jwt-token-123', 'note-1');
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      success: true,
      message: 'Note deleted.',
    });
  });

  it('should search notes via /api/v1/search and return hits', async () => {
    const hit: SearchHit = {
      id: 'note-7',
      title: 'Q2 budget decisions',
      updatedAt: '2026-06-15T00:00:00.000Z',
      isOwner: true,
      isSharedWithMe: false,
      isPubliclyShared: false,
    };
    searchApi = createMockSearchApi({
      search: vi.fn().mockResolvedValue([hit]),
    });
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, searchApi, authService, CREDENTIAL);

    const result = await getTool(tools, 'search-notes').cb({ query: 'budget' });

    expect(searchApi.search).toHaveBeenCalledWith(
      'jwt-token-123',
      'budget',
      undefined
    );
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ hits: [hit] });
  });

  it('should forward the limit argument to searchApi.search', async () => {
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, searchApi, authService, CREDENTIAL);

    await getTool(tools, 'search-notes').cb({ query: 'budget', limit: 5 });

    expect(searchApi.search).toHaveBeenCalledWith('jwt-token-123', 'budget', 5);
  });

  it('should reject search-notes without notes:read scope', async () => {
    const oauthCredential: McpCredential = {
      kind: 'oauth',
      jwt: 'oauth-jwt',
      scopes: ['notes:write'],
    };
    const realAuthService = new AuthService('http://localhost/exchange');
    const { server, tools } = createFakeServer();
    registerNotesTools(
      server,
      notesApi,
      searchApi,
      realAuthService,
      oauthCredential
    );

    const result = await getTool(tools, 'search-notes').cb({ query: 'budget' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('notes:read');
    expect(searchApi.search).not.toHaveBeenCalled();
  });

  it('should surface API failures as isError results', async () => {
    notesApi = createMockNotesApi({
      list: vi.fn().mockRejectedValue(new Error('upstream exploded')),
    });
    const { server, tools } = createFakeServer();
    registerNotesTools(server, notesApi, searchApi, authService, CREDENTIAL);

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
    registerNotesTools(server, notesApi, searchApi, authService, CREDENTIAL);

    const result = await getTool(tools, 'get-note').cb({ noteId: 'note-1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Authentication failed: key revoked');
    expect(notesApi.get).not.toHaveBeenCalled();
  });
});
