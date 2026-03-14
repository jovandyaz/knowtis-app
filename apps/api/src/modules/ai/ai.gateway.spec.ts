import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_ACTION } from '@knowtis/shared-types';

import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { AIGateway } from './ai.gateway';
import { StreamTextHandler } from './application/commands/stream-text.handler';

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
  let mockFeatureFlags: FeatureFlagsService;

  beforeEach(() => {
    mockStreamHandler = {
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as StreamTextHandler;

    mockJwtService = {
      verify: vi.fn().mockReturnValue({ sub: 'user-123' }),
    } as unknown as JwtService;

    mockFeatureFlags = {
      isEnabled: vi.fn().mockResolvedValue(true),
    } as unknown as FeatureFlagsService;

    gateway = new AIGateway(
      mockStreamHandler,
      mockJwtService,
      mockFeatureFlags
    );
  });

  describe('handleConnection', () => {
    it('should authenticate client with valid token', async () => {
      const client = createMockAISocket({
        handshake: { auth: { token: 'valid-jwt' }, headers: {} },
      });

      await gateway.handleConnection(client);

      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-jwt');
      expect(client.data.userId).toBe('user-123');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect when no token provided', async () => {
      const client = createMockAISocket();

      await gateway.handleConnection(client);

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'AUTH_REQUIRED' })
      );
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect on invalid token', async () => {
      vi.spyOn(mockJwtService, 'verify').mockImplementation(() => {
        throw new Error('invalid');
      });

      const client = createMockAISocket({
        handshake: { auth: { token: 'bad-jwt' }, headers: {} },
      });

      await gateway.handleConnection(client);

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'AUTH_REQUIRED' })
      );
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect when AI is disabled', async () => {
      vi.mocked(mockFeatureFlags.isEnabled).mockResolvedValue(false);

      const client = createMockAISocket({
        handshake: { auth: { token: 'valid-jwt' }, headers: {} },
      });

      await gateway.handleConnection(client);

      expect(mockFeatureFlags.isEnabled).toHaveBeenCalledWith('ai_enabled');
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
        action: AI_ACTION.SUMMARIZE,
        content: 'Some note content to summarize',
      });

      expect(mockStreamHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          action: AI_ACTION.SUMMARIZE,
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
        action: AI_ACTION.SUMMARIZE,
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
        action: AI_ACTION.SUMMARIZE,
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
        action: AI_ACTION.TRANSLATE,
        content: 'Hello world',
        targetLanguage: 'Spanish',
      });

      expect(mockStreamHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AI_ACTION.TRANSLATE,
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
        action: AI_ACTION.TRANSLATE,
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
        action: AI_ACTION.SUMMARIZE,
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
        action: AI_ACTION.SUMMARIZE,
        content: 'Some content',
      });

      const signal = vi.mocked(mockStreamHandler.execute).mock
        .calls[0]?.[2] as AbortSignal;

      gateway.handleDisconnect(client);

      expect(signal?.aborted).toBe(true);
    });
  });
});
