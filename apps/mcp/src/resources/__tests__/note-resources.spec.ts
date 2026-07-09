import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotesApi } from '../../api-client/notes.api.js';
import { AuthService } from '../../auth/auth-service.js';
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

async function connect(notesApi: NotesApi) {
  const server = new McpServer(
    { name: 'test', version: '0.0.0' },
    { capabilities: { resources: {} } }
  );
  registerNoteResources(server, notesApi, new AuthService('http://unused'), {
    kind: 'oauth',
    jwt: 'jwt-token',
    scopes: ['notes:read'],
  });
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
    await expect(
      client.readResource({ uri: 'knowtis://notes/not-a-uuid' })
    ).rejects.toThrow();
  });
});
