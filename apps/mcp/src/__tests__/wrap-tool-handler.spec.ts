import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api-client/client.js';
import type { AuthService } from '../auth/auth-service.js';
import type { McpCredential } from '../auth/credentials.js';
import { logToolCall } from '../middleware/logger.js';
import { wrapToolHandler } from '../tools/wrap-tool-handler.js';

vi.mock('../middleware/logger.js', () => ({
  logToolCall: vi.fn(),
}));

function createMockAuthService(
  overrides: Partial<AuthService> = {}
): AuthService {
  return {
    getToken: vi.fn().mockResolvedValue('jwt-token-123'),
    checkScope: vi.fn(),
    checkScopes: vi.fn(),
    ...overrides,
  } as unknown as AuthService;
}

const TEST_API_KEY = 'knowtis_mcp_test_abcdefghijklmnopqrstuvwxyz';
const API_KEY_CRED: McpCredential = {
  kind: 'api-key',
  apiKey: TEST_API_KEY,
};

describe('wrapToolHandler', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = createMockAuthService();
  });

  it('should return error when no credential is configured', async () => {
    const handler = vi.fn();
    const wrapped = wrapToolHandler('list-notes', authService, handler);

    const result = await wrapped({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No API key configured');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should log missing-credential calls under the "none" key', async () => {
    vi.mocked(logToolCall).mockClear();
    const wrapped = wrapToolHandler('list-notes', authService, vi.fn());

    await wrapped({});

    expect(logToolCall).toHaveBeenCalledWith(
      'list-notes',
      'none',
      expect.any(Number),
      'error',
      undefined
    );
  });

  it('should authenticate with the configured API key', async () => {
    const handler = vi.fn().mockResolvedValue({ notes: [] });
    const wrapped = wrapToolHandler(
      'list-notes',
      authService,
      handler,
      API_KEY_CRED
    );

    const result = await wrapped({});

    expect(result.isError).toBeUndefined();
    expect(authService.checkScope).toHaveBeenCalledWith(
      TEST_API_KEY,
      'list-notes'
    );
    expect(authService.getToken).toHaveBeenCalledWith(TEST_API_KEY);
  });

  it('should use the oauth JWT directly without a token exchange', async () => {
    const handler = vi.fn().mockResolvedValue({ notes: [] });
    const credential: McpCredential = {
      kind: 'oauth',
      jwt: 'oauth.jwt.value',
      scopes: ['notes:read'],
    };
    const wrapped = wrapToolHandler(
      'list-notes',
      authService,
      handler,
      credential
    );

    const result = await wrapped({});

    expect(result.isError).toBeUndefined();
    expect(authService.getToken).not.toHaveBeenCalled();
    expect(authService.checkScopes).toHaveBeenCalledWith(
      ['notes:read'],
      'list-notes'
    );
    expect(handler).toHaveBeenCalledWith('oauth.jwt.value', {});
  });

  it('should return formatted error when the oauth token lacks the scope', async () => {
    authService = createMockAuthService({
      checkScopes: vi.fn().mockImplementation(() => {
        throw new Error(
          "Access token does not have 'notes:write' scope required for tool 'create-note'."
        );
      }),
    });
    const handler = vi.fn();
    const credential: McpCredential = {
      kind: 'oauth',
      jwt: 'oauth.jwt.value',
      scopes: ['notes:read'],
    };
    const wrapped = wrapToolHandler(
      'create-note',
      authService,
      handler,
      credential
    );

    const result = await wrapped({ title: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('notes:write');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should return handler result as JSON text content on success', async () => {
    const data = { id: '1', title: 'My Note' };
    const handler = vi.fn().mockResolvedValue(data);
    const wrapped = wrapToolHandler(
      'get-note',
      authService,
      handler,
      API_KEY_CRED
    );

    const result = await wrapped({ noteId: '1' });

    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify(data) },
    ]);
  });

  it('should return structuredContent alongside the serialized text block', async () => {
    const data = { note: { id: '1', title: 'My Note' } };
    const handler = vi.fn().mockResolvedValue(data);
    const wrapped = wrapToolHandler(
      'get-note',
      authService,
      handler,
      API_KEY_CRED
    );

    const result = await wrapped({ noteId: '1' });

    expect(result.structuredContent).toEqual(data);
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify(data) },
    ]);
  });

  it('should call getToken before checkScope (prevents cold cache bypass)', async () => {
    const callOrder: string[] = [];
    authService = createMockAuthService({
      getToken: vi.fn().mockImplementation(async () => {
        callOrder.push('getToken');
        return 'jwt-token-123';
      }),
      checkScope: vi.fn().mockImplementation(() => {
        callOrder.push('checkScope');
      }),
    });
    const handler = vi.fn().mockResolvedValue({});
    const wrapped = wrapToolHandler(
      'create-note',
      authService,
      handler,
      API_KEY_CRED
    );

    await wrapped({});

    expect(callOrder).toEqual(['getToken', 'checkScope']);
  });

  it('should return formatted error when scope check fails', async () => {
    authService = createMockAuthService({
      checkScope: vi.fn().mockImplementation(() => {
        throw new Error("API key does not have 'notes:write' scope");
      }),
    });
    const handler = vi.fn();
    const wrapped = wrapToolHandler(
      'create-note',
      authService,
      handler,
      API_KEY_CRED
    );

    const result = await wrapped({ title: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('notes:write');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should return formatted error for ApiError (403)', async () => {
    const handler = vi
      .fn()
      .mockRejectedValue(new ApiError(403, { message: 'Forbidden' }));
    const wrapped = wrapToolHandler(
      'delete-note',
      authService,
      handler,
      API_KEY_CRED
    );

    const result = await wrapped({ noteId: '1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('permission');
  });

  it('should return formatted error for ApiError (404)', async () => {
    const handler = vi
      .fn()
      .mockRejectedValue(new ApiError(404, { message: 'Not found' }));
    const wrapped = wrapToolHandler(
      'get-note',
      authService,
      handler,
      API_KEY_CRED
    );

    const result = await wrapped({ noteId: 'nonexistent' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('should return formatted error for auth failure (401)', async () => {
    authService = createMockAuthService({
      getToken: vi
        .fn()
        .mockRejectedValue(new Error('Authentication failed: Invalid API key')),
    });
    const handler = vi.fn();
    const wrapped = wrapToolHandler(
      'list-notes',
      authService,
      handler,
      API_KEY_CRED
    );

    const result = await wrapped({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Authentication failed');
    expect(handler).not.toHaveBeenCalled();
  });
});
