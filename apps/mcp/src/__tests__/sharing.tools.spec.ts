import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Collaborator, SharingApi } from '../api-client/sharing.api.js';
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
    getCollaborators: vi.fn().mockResolvedValue([]),
    share: vi.fn(),
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
    registerSharingTools(server, sharingApi, authService, CREDENTIAL);

    const result = await getTool(tools, 'get-collaborators').cb({
      noteId: 'note-1',
    });

    expect(sharingApi.getCollaborators).toHaveBeenCalledWith(
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
      userId: 'user-2',
      permission: 'viewer',
    });

    expect(sharingApi.share).toHaveBeenCalledWith(
      'jwt-token-123',
      'note-1',
      'user-2',
      'viewer'
    );
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ success: true });
  });

  it('should surface API failures as isError results', async () => {
    sharingApi = createMockSharingApi({
      getCollaborators: vi.fn().mockRejectedValue(new Error('upstream down')),
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
