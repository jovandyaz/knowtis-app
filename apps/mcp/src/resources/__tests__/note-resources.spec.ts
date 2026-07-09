import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../api-client/client.js';
import type { NotesApi } from '../../api-client/notes.api.js';
import { AuthService } from '../../auth/auth-service.js';
import type { McpCredential } from '../../auth/credentials.js';
import { registerNoteResources } from '../note-resources.js';

function note(id: string, updatedAt: string) {
  return {
    id,
    title: `Note ${id}`,
    content: `<p>body ${id}</p>`,
    ownerId: 'u1',
    createdAt: updatedAt,
    updatedAt,
  };
}

const NOTE_A = note(
  '11111111-1111-4111-8111-111111111111',
  '2026-07-03T00:00:00.000Z'
);
const NOTE_B = note(
  '22222222-2222-4222-8222-222222222222',
  '2026-07-02T00:00:00.000Z'
);
const NOTE_C = note(
  '33333333-3333-4333-8333-333333333333',
  '2026-07-01T00:00:00.000Z'
);

const DEFAULT_CREDENTIAL: McpCredential = {
  kind: 'oauth',
  jwt: 'jwt-token',
  scopes: ['notes:read'],
};

interface ConnectOptions {
  credential?: McpCredential;
  authService?: AuthService;
  omitCredential?: boolean;
}

async function connect(
  notesApi: NotesApi,
  {
    credential = DEFAULT_CREDENTIAL,
    authService = new AuthService('http://unused'),
    omitCredential = false,
  }: ConnectOptions = {}
) {
  const server = new McpServer(
    { name: 'test', version: '0.0.0' },
    { capabilities: { resources: {} } }
  );
  registerNoteResources(
    server,
    notesApi,
    authService,
    omitCredential ? undefined : credential
  );
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  return client;
}

describe('note resources', () => {
  let notesApi: {
    list: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    notesApi = {
      list: vi.fn().mockResolvedValue([NOTE_C, NOTE_A, NOTE_B]),
      get: vi.fn().mockResolvedValue(NOTE_A),
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should list recent notes as resources ordered by recency', async () => {
    const client = await connect(notesApi as unknown as NotesApi);
    const result = await client.listResources();
    expect(result.resources[0]).toMatchObject({
      uri: `knowtis://notes/${NOTE_A.id}`,
      name: NOTE_A.title,
      mimeType: 'text/markdown',
    });
    expect(result.resources).toHaveLength(3);
  });

  it('should paginate resources/list with nextCursor', async () => {
    notesApi.list.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) =>
        note(
          `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`,
          new Date(Date.UTC(2026, 5, 1 + i)).toISOString()
        )
      )
    );
    const client = await connect(notesApi as unknown as NotesApi);
    const page1 = await client.listResources();
    expect(page1.resources).toHaveLength(20);
    expect(page1.nextCursor).toBeDefined();
    const page2 = await client.listResources({ cursor: page1.nextCursor });
    expect(page2.resources).toHaveLength(5);
    expect(page2.nextCursor).toBeUndefined();
  });

  it('should read a note as Markdown', async () => {
    const client = await connect(notesApi as unknown as NotesApi);
    const result = await client.readResource({
      uri: `knowtis://notes/${NOTE_A.id}`,
    });
    expect(result.contents[0]).toMatchObject({
      uri: `knowtis://notes/${NOTE_A.id}`,
      mimeType: 'text/markdown',
    });
    expect((result.contents[0] as { text: string }).text).toContain('body');
    expect(notesApi.get).toHaveBeenCalledWith('jwt-token', NOTE_A.id);
  });

  it('should advertise the note resource template', async () => {
    const client = await connect(notesApi as unknown as NotesApi);
    const result = await client.listResourceTemplates();
    expect(result.resourceTemplates[0]).toMatchObject({
      uriTemplate: 'knowtis://notes/{noteId}',
      mimeType: 'text/markdown',
    });
  });

  it('should reject reads for malformed URIs', async () => {
    const client = await connect(notesApi as unknown as NotesApi);
    const error = await client
      .readResource({ uri: 'knowtis://notes/not-a-uuid' })
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
    expect(notesApi.get).not.toHaveBeenCalled();
  });

  it('should reject resources/read when the token lacks notes:read scope', async () => {
    const client = await connect(notesApi as unknown as NotesApi, {
      credential: { kind: 'oauth', jwt: 'jwt-token', scopes: ['notes:write'] },
    });
    const error = await client
      .readResource({ uri: `knowtis://notes/${NOTE_A.id}` })
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(ErrorCode.InvalidRequest);
    expect((error as McpError).message).toContain('notes:read');
    expect(notesApi.get).not.toHaveBeenCalled();
  });

  it('should reject resources/list when the token lacks notes:read scope', async () => {
    const client = await connect(notesApi as unknown as NotesApi, {
      credential: { kind: 'oauth', jwt: 'jwt-token', scopes: ['notes:write'] },
    });
    const error = await client.listResources().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(ErrorCode.InvalidRequest);
    expect((error as McpError).message).toContain('notes:read');
    expect(notesApi.list).not.toHaveBeenCalled();
  });

  it('should list resources for an api-key credential with notes:read scope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          accessToken: 'exchanged-jwt',
          expiresIn: 3600,
          scopes: 'notes:read,notes:write',
        }),
      })
    );
    const client = await connect(notesApi as unknown as NotesApi, {
      credential: { kind: 'api-key', apiKey: 'knowtis_mcp_x' },
      authService: new AuthService('http://exchange'),
    });

    const result = await client.listResources();

    expect(result.resources).toHaveLength(3);
    expect(notesApi.list).toHaveBeenCalledWith('exchanged-jwt');
  });

  it('should reject resources/read and resources/list with an InvalidRequest McpError when no credential is present', async () => {
    const readClient = await connect(notesApi as unknown as NotesApi, {
      omitCredential: true,
    });
    const readError = await readClient
      .readResource({ uri: `knowtis://notes/${NOTE_A.id}` })
      .catch((error: unknown) => error);
    expect(readError).toBeInstanceOf(McpError);
    expect((readError as McpError).code).toBe(ErrorCode.InvalidRequest);
    expect(notesApi.get).not.toHaveBeenCalled();

    const listClient = await connect(notesApi as unknown as NotesApi, {
      omitCredential: true,
    });
    const listError = await listClient
      .listResources()
      .catch((error: unknown) => error);
    expect(listError).toBeInstanceOf(McpError);
    expect((listError as McpError).code).toBe(ErrorCode.InvalidRequest);
    expect(notesApi.list).not.toHaveBeenCalled();
  });

  it('should map an upstream 404 to a not-found message without leaking the body', async () => {
    notesApi.get.mockRejectedValue(
      new ApiError(404, { message: 'internal upstream detail' })
    );
    const client = await connect(notesApi as unknown as NotesApi);
    const error = await client
      .readResource({ uri: `knowtis://notes/${NOTE_A.id}` })
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(-32002);
    expect((error as McpError).message).toContain('Note not found.');
    expect((error as McpError).message).not.toContain(
      'internal upstream detail'
    );
  });

  it('should map an upstream 429 on resources/list to a retryable rate-limit message', async () => {
    notesApi.list.mockRejectedValue(
      new ApiError(429, { message: 'internal upstream detail' })
    );
    const client = await connect(notesApi as unknown as NotesApi);
    const error = await client.listResources().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(ErrorCode.InternalError);
    expect((error as McpError).message).toContain('Rate limit exceeded');
    expect((error as McpError).message).not.toContain(
      'internal upstream detail'
    );
  });

  it('should map an upstream 403 on resources/list to a permission message', async () => {
    notesApi.list.mockRejectedValue(
      new ApiError(403, { message: 'internal upstream detail' })
    );
    const client = await connect(notesApi as unknown as NotesApi);
    const error = await client.listResources().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(ErrorCode.InvalidRequest);
    expect((error as McpError).message).toContain('permission');
    expect((error as McpError).message).not.toContain(
      'internal upstream detail'
    );
  });

  it('should map an upstream 422 on resources/list to an invalid-input message', async () => {
    notesApi.list.mockRejectedValue(
      new ApiError(422, { message: 'bad query' })
    );
    const client = await connect(notesApi as unknown as NotesApi);
    const error = await client.listResources().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
    expect((error as McpError).message).toContain('Invalid input');
  });

  it('should map an upstream 401 on resources/list without leaking the body', async () => {
    notesApi.list.mockRejectedValue(
      new ApiError(401, { message: 'internal upstream detail' })
    );
    const client = await connect(notesApi as unknown as NotesApi);
    const error = await client.listResources().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(ErrorCode.InvalidRequest);
    expect((error as McpError).message).not.toContain(
      'internal upstream detail'
    );
  });

  it('should use a list-specific fallback for unmapped upstream errors on resources/list', async () => {
    notesApi.list.mockRejectedValue(
      new ApiError(500, { message: 'internal upstream detail' })
    );
    const client = await connect(notesApi as unknown as NotesApi);
    const error = await client.listResources().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(ErrorCode.InternalError);
    expect((error as McpError).message).toContain('Failed to list notes.');
    expect((error as McpError).message).not.toContain(
      'internal upstream detail'
    );
  });

  it('should collapse a multiline title into a single-line Markdown heading', async () => {
    notesApi.get.mockResolvedValue({
      ...NOTE_A,
      title: 'Line one\nLine two\n# hash',
    });
    const client = await connect(notesApi as unknown as NotesApi);
    const result = await client.readResource({
      uri: `knowtis://notes/${NOTE_A.id}`,
    });
    const text = (result.contents[0] as { text: string }).text;
    expect(text.split('\n')[0]).toBe('# Line one Line two # hash');
  });
});
