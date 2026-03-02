import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../config/env.config';
import { AIGateway } from './ai.gateway';
import { StreamTextHandler } from './application/commands/stream-text.handler';

type TypedConfigService = ConfigService<EnvConfig, true>;

function createMockAISocket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'socket-1',
    data: {} as Record<string, unknown>,
    emit: vi.fn(),
    disconnect: vi.fn(),
    handshake: { auth: {}, headers: {} },
    ...overrides,
  } as unknown as Parameters<AIGateway['handleConnection']>[0];
}

describe('AIGateway', () => {
  let gateway: AIGateway;
  let mockStreamHandler: StreamTextHandler;
  let mockJwtService: JwtService;
  let mockConfig: TypedConfigService;

  beforeEach(() => {
    mockStreamHandler = {
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as StreamTextHandler;

    mockJwtService = {
      verify: vi.fn().mockReturnValue({ sub: 'user-123' }),
    } as unknown as JwtService;

    mockConfig = {
      get: vi.fn((key: string) => {
        const config: Record<string, unknown> = {
          AI_ENABLED: 'true',
          FRONTEND_URL: 'http://localhost:4200',
        };
        return config[key];
      }),
    } as unknown as TypedConfigService;

    gateway = new AIGateway(mockStreamHandler, mockJwtService, mockConfig);
  });

  describe('handleConnection', () => {
    it('should authenticate client with valid token', () => {
      const client = createMockAISocket({
        handshake: { auth: { token: 'valid-jwt' }, headers: {} },
      });

      gateway.handleConnection(client);

      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-jwt');
      expect(client.data.userId).toBe('user-123');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect when no token provided', () => {
      const client = createMockAISocket();

      gateway.handleConnection(client);

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'AUTH_REQUIRED' })
      );
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect on invalid token', () => {
      vi.spyOn(mockJwtService, 'verify').mockImplementation(() => {
        throw new Error('invalid');
      });

      const client = createMockAISocket({
        handshake: { auth: { token: 'bad-jwt' }, headers: {} },
      });

      gateway.handleConnection(client);

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'AUTH_REQUIRED' })
      );
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect when AI is disabled', () => {
      vi.spyOn(mockConfig, 'get').mockImplementation((key: string) => {
        if (key === 'AI_ENABLED') {
          return 'false';
        }
        return 'http://localhost:4200';
      });

      const client = createMockAISocket({
        handshake: { auth: { token: 'valid-jwt' }, headers: {} },
      });

      gateway.handleConnection(client);

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'AI_FEATURE_DISABLED' })
      );
      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleComplete', () => {
    it('should call streamTextHandler with valid payload', async () => {
      const client = createMockAISocket();
      client.data.userId = 'user-123';

      await gateway.handleComplete(client, {
        action: 'summarize',
        content: 'Some note content to summarize',
      });

      expect(mockStreamHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          action: 'summarize',
          content: 'Some note content to summarize',
        }),
        expect.objectContaining({
          onChunk: expect.any(Function),
          onDone: expect.any(Function),
          onError: expect.any(Function),
        }),
        expect.any(AbortSignal)
      );
    });

    it('should emit validation error for invalid action', async () => {
      const client = createMockAISocket();
      client.data.userId = 'user-123';

      await gateway.handleComplete(client, {
        action: 'invalid-action',
        content: 'Some content',
      });

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'VALIDATION_ERROR' })
      );
      expect(mockStreamHandler.execute).not.toHaveBeenCalled();
    });

    it('should emit AUTH_REQUIRED when no userId', async () => {
      const client = createMockAISocket();

      await gateway.handleComplete(client, {
        action: 'summarize',
        content: 'Some content',
      });

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'AUTH_REQUIRED' })
      );
    });

    it('should emit validation error for missing content', async () => {
      const client = createMockAISocket();
      client.data.userId = 'user-123';

      await gateway.handleComplete(client, {
        action: 'summarize',
      });

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'VALIDATION_ERROR' })
      );
    });

    it('should pass targetLanguage for translate action', async () => {
      const client = createMockAISocket();
      client.data.userId = 'user-123';

      await gateway.handleComplete(client, {
        action: 'translate',
        content: 'Hello world',
        targetLanguage: 'Spanish',
      });

      expect(mockStreamHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'translate',
          targetLanguage: 'Spanish',
        }),
        expect.any(Object),
        expect.any(AbortSignal)
      );
    });

    it('should emit validation error for invalid targetLanguage', async () => {
      const client = createMockAISocket();
      client.data.userId = 'user-123';

      await gateway.handleComplete(client, {
        action: 'translate',
        content: 'Hello world',
        targetLanguage: 'Klingon',
      });

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'VALIDATION_ERROR' })
      );
    });
  });

  describe('handleCancel', () => {
    it('should abort an active stream', async () => {
      const client = createMockAISocket();
      client.data.userId = 'user-123';

      await gateway.handleComplete(client, {
        action: 'summarize',
        content: 'Some content',
      });

      const executeCall = vi.mocked(mockStreamHandler.execute).mock.calls[0];
      const signal = executeCall?.[2] as AbortSignal;

      expect(signal?.aborted).toBe(false);

      gateway.handleCancel(client);

      expect(signal?.aborted).toBe(true);
    });
  });

  describe('handleDisconnect', () => {
    it('should abort active stream on disconnect', async () => {
      const client = createMockAISocket();
      client.data.userId = 'user-123';

      await gateway.handleComplete(client, {
        action: 'summarize',
        content: 'Some content',
      });

      const signal = vi.mocked(mockStreamHandler.execute).mock
        .calls[0]?.[2] as AbortSignal;

      gateway.handleDisconnect(client);

      expect(signal?.aborted).toBe(true);
    });
  });
});
