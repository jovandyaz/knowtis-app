import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { NotePerson } from '@knowtis/shared-types';

import type { SharingApi } from '../api-client/sharing.api.js';
import type { AuthService } from '../auth/auth-service.js';
import type { McpCredential } from '../auth/credentials.js';
import { registerSharingTools } from '../tools/sharing.tools.js';
import {
  createFakeServer,
  createMockAuthService,
  getTool,
  TEST_API_KEY,
} from './test-utils.js';

const CREDENTIAL: McpCredential = { kind: 'api-key', apiKey: TEST_API_KEY };

function createMockSharingApi(overrides: Partial<SharingApi> = {}): SharingApi {
  return {
    getPeople: vi.fn().mockResolvedValue([]),
    upsertPerson: vi.fn(),
    ...overrides,
  } as unknown as SharingApi;
}

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const NON_DESTRUCTIVE_IDEMPOTENT = {
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

    registerSharingTools(server, sharingApi, authService, CREDENTIAL);

    expect([...tools.keys()].sort()).toEqual([
      'get-collaborators',
      'share-note',
    ]);
  });

  it('should annotate get-collaborators as read-only and share-note as mutating non-destructive', () => {
    const { server, tools } = createFakeServer();
    registerSharingTools(server, sharingApi, authService, CREDENTIAL);

    expect(getTool(tools, 'get-collaborators').config.annotations).toEqual(
      READ_ONLY
    );
    expect(getTool(tools, 'share-note').config.annotations).toEqual(
      NON_DESTRUCTIVE_IDEMPOTENT
    );
  });

  it('should set titles and expected output-schema shapes on every tool', () => {
    const { server, tools } = createFakeServer();
    registerSharingTools(server, sharingApi, authService, CREDENTIAL);

    expect(getTool(tools, 'get-collaborators').config.title).toBe(
      'Get Collaborators'
    );
    expect(getTool(tools, 'share-note').config.title).toBe('Share Note');

    expect(
      Object.keys(getTool(tools, 'get-collaborators').config.outputSchema ?? {})
    ).toEqual(['collaborators']);
    expect(
      Object.keys(getTool(tools, 'share-note').config.outputSchema ?? {})
    ).toEqual(['success']);
  });

  it('should keep tool descriptions verbatim', () => {
    const { server, tools } = createFakeServer();
    registerSharingTools(server, sharingApi, authService, CREDENTIAL);

    expect(getTool(tools, 'get-collaborators').config.description).toBe(
      'List who has access to a note and their permission level (owner, editor, viewer).'
    );
    expect(getTool(tools, 'share-note').config.description).toBe(
      'Add a person to a note by their exact email address.'
    );
  });

  it('should return collaborators from the get-collaborators handler', async () => {
    const collaborators: NotePerson[] = [
      {
        user: {
          id: 'user-1',
          email: 'user1@example.com',
          name: 'User One',
          avatarUrl: null,
        },
        permission: 'editor',
      },
    ];
    sharingApi = createMockSharingApi({
      getPeople: vi.fn().mockResolvedValue(collaborators),
    });
    const { server, tools } = createFakeServer();
    registerSharingTools(server, sharingApi, authService, CREDENTIAL);

    const result = await getTool(tools, 'get-collaborators').cb({
      noteId: 'note-1',
    });

    expect(sharingApi.getPeople).toHaveBeenCalledWith(
      'jwt-token-123',
      'note-1'
    );
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ collaborators });
  });

  it('should report success from the share-note handler', async () => {
    const { server, tools } = createFakeServer();
    registerSharingTools(server, sharingApi, authService, CREDENTIAL);

    const result = await getTool(tools, 'share-note').cb({
      noteId: 'note-1',
      email: 'user2@example.com',
      permission: 'viewer',
    });

    expect(sharingApi.upsertPerson).toHaveBeenCalledWith(
      'jwt-token-123',
      'note-1',
      { email: 'user2@example.com', permission: 'viewer' }
    );
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ success: true });
  });

  it('validates the email tool schema and rejects a legacy UUID-only input', () => {
    const { server, tools } = createFakeServer();
    registerSharingTools(server, sharingApi, authService, CREDENTIAL);
    const shape = getTool(tools, 'share-note').config
      .inputSchema as z.ZodRawShape;
    const schema = z.object(shape);
    const noteId = '22222222-2222-4222-8222-222222222222';
    expect(
      schema.safeParse({ noteId, userId: noteId, permission: 'viewer' }).success
    ).toBe(false);
    expect(
      schema.parse({
        noteId,
        email: '  PERSON@EXAMPLE.COM  ',
        permission: 'viewer',
      })
    ).toEqual({ noteId, email: 'person@example.com', permission: 'viewer' });
  });

  it('should surface API failures as isError results', async () => {
    sharingApi = createMockSharingApi({
      getPeople: vi.fn().mockRejectedValue(new Error('upstream down')),
    });
    const { server, tools } = createFakeServer();
    registerSharingTools(server, sharingApi, authService, CREDENTIAL);

    const result = await getTool(tools, 'get-collaborators').cb({
      noteId: 'note-1',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('upstream down');
    expect(result.structuredContent).toBeUndefined();
  });
});
