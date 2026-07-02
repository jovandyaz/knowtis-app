import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api-client/client.js';
import type { AuthService } from '../auth/auth-service.js';
import { wrapToolHandler } from '../tools/wrap-tool-handler.js';

function createMockAuthService(
  overrides: Partial<AuthService> = {}
): AuthService {
  return {
    getToken: vi.fn().mockResolvedValue('jwt-token-123'),
    checkScope: vi.fn(),
    ...overrides,
  } as unknown as AuthService;
}

const TEST_API_KEY = 'knowtis_mcp_test_abcdefghijklmnopqrstuvwxyz';

describe('wrapToolHandler', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = createMockAuthService();
  });

  it('should return error when no API key is configured', async () => {
    const handler = vi.fn();
    const wrapped = wrapToolHandler('list-notes', authService, handler);

    const result = await wrapped({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No API key configured');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should authenticate with the configured API key', async () => {
    const handler = vi.fn().mockResolvedValue({ notes: [] });
    const wrapped = wrapToolHandler(
      'list-notes',
      authService,
      handler,
      TEST_API_KEY
    );

    const result = await wrapped({});

    expect(result.isError).toBeUndefined();
    expect(authService.checkScope).toHaveBeenCalledWith(
      TEST_API_KEY,
      'list-notes'
    );
    expect(authService.getToken).toHaveBeenCalledWith(TEST_API_KEY);
  });

  it('should return handler result as JSON text content on success', async () => {
    const data = { id: '1', title: 'My Note' };
    const handler = vi.fn().mockResolvedValue(data);
    const wrapped = wrapToolHandler(
      'get-note',
      authService,
      handler,
      TEST_API_KEY
    );

    const result = await wrapped({ noteId: '1' });

    expect(result.isError).toBeUndefined();
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
      TEST_API_KEY
    );

    await wrapped({});

    expect(callOrder).toEqual(['getToken', 'checkScope']);
  });

  it('should return formatted error when scope check fails', async () => {
    authService = createMockAuthService({
      checkScope: vi.fn().mockImplementation(() => {
        throw new Error("API key does not have 'write' scope");
      }),
    });
    const handler = vi.fn();
    const wrapped = wrapToolHandler(
      'create-note',
      authService,
      handler,
      TEST_API_KEY
    );

    const result = await wrapped({ title: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('write');
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
      TEST_API_KEY
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
      TEST_API_KEY
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
      TEST_API_KEY
    );

    const result = await wrapped({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Authentication failed');
    expect(handler).not.toHaveBeenCalled();
  });
});
