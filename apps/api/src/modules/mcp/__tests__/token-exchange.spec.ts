import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';

import { McpKeysService } from '../mcp-keys.service';
import { TokenExchangeController } from '../token-exchange.controller';

function createMockKeyRecord(overrides = {}) {
  const { fullKey, prefix, hash } = McpKeysService.generateKeyParts('test');

  return {
    record: {
      id: 'key-id-1',
      userId: 'user-id-1',
      name: 'Test Key',
      keyHash: hash,
      keyPrefix: prefix,
      scopes: 'notes:read',
      isActive: true,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      ...overrides,
    },
    fullKey,
    prefix,
  };
}

function createController(deps: {
  findByPrefix?: ReturnType<typeof vi.fn>;
  updateLastUsed?: ReturnType<typeof vi.fn>;
  dbSelect?: unknown[];
}) {
  const mcpKeysService = {
    findByPrefix: deps.findByPrefix ?? vi.fn().mockResolvedValue(null),
    updateLastUsed: deps.updateLastUsed ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as McpKeysService;

  const jwtService = {
    signAsync: vi.fn().mockResolvedValue('mock-jwt-token'),
  } as unknown as JwtService;

  const configService = {
    getOrThrow: vi.fn().mockReturnValue('test-secret'),
  } as unknown as ConfigService;

  const dbResult = deps.dbSelect ?? [];
  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(dbResult),
        }),
      }),
    }),
  };

  const controller = new TokenExchangeController(
    mcpKeysService,
    jwtService,
    configService,
    db as never
  );

  return { controller, mcpKeysService, jwtService, configService, db };
}

describe('TokenExchangeController', () => {
  it('should exchange a valid API key for a JWT', async () => {
    const { record, fullKey } = createMockKeyRecord();

    const { controller, jwtService } = createController({
      findByPrefix: vi.fn().mockResolvedValue(record),
      dbSelect: [{ id: record.userId, email: 'user@test.com' }],
    });

    const result = await controller.exchange({ apiKey: fullKey });

    expect(result).toEqual({
      accessToken: 'mock-jwt-token',
      expiresIn: 900,
      scopes: 'notes:read',
    });

    expect(jwtService.signAsync).toHaveBeenCalledWith(
      {
        sub: record.userId,
        email: 'user@test.com',
        source: 'mcp',
        scopes: 'notes:read',
      },
      { secret: 'test-secret', expiresIn: '15m' }
    );
  });

  it('should embed scopes in JWT for write,share keys', async () => {
    const { record, fullKey } = createMockKeyRecord({
      scopes: 'notes:read,notes:write,notes:share',
    });

    const { controller, jwtService } = createController({
      findByPrefix: vi.fn().mockResolvedValue(record),
      dbSelect: [{ id: record.userId, email: 'user@test.com' }],
    });

    await controller.exchange({ apiKey: fullKey });

    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'mcp',
        scopes: 'notes:read,notes:write,notes:share',
      }),
      expect.any(Object)
    );
  });

  it('should update lastUsedAt on successful exchange', async () => {
    const { record, fullKey } = createMockKeyRecord();
    const updateLastUsed = vi.fn().mockResolvedValue(undefined);

    const { controller } = createController({
      findByPrefix: vi.fn().mockResolvedValue(record),
      updateLastUsed,
      dbSelect: [{ id: record.userId, email: 'user@test.com' }],
    });

    await controller.exchange({ apiKey: fullKey });

    expect(updateLastUsed).toHaveBeenCalledWith(record.id);
  });

  describe('generic failure responses', () => {
    const expectGenericUnauthorized = async (run: () => Promise<unknown>) => {
      const error = await run().then(
        () => null,
        (e: unknown) => e
      );
      if (!(error instanceof UnauthorizedException)) {
        throw new Error('Expected UnauthorizedException');
      }
      expect(error.message).toBe('Invalid API key');
    };

    it('should return the same generic error when prefix is unknown', async () => {
      const { controller } = createController({
        findByPrefix: vi.fn().mockResolvedValue(null),
      });

      await expectGenericUnauthorized(() =>
        controller.exchange({ apiKey: 'invalid_key_prefix_xxxxxxxx' })
      );
    });

    it('should return the same generic error when hash mismatches', async () => {
      const { record } = createMockKeyRecord();
      const { controller } = createController({
        findByPrefix: vi.fn().mockResolvedValue(record),
      });

      await expectGenericUnauthorized(() =>
        controller.exchange({ apiKey: record.keyPrefix + '_wrong_secret' })
      );
    });

    it('should return the same generic error when key is expired', async () => {
      const { record, fullKey } = createMockKeyRecord({
        expiresAt: new Date('2020-01-01'),
      });
      const { controller } = createController({
        findByPrefix: vi.fn().mockResolvedValue(record),
      });

      await expectGenericUnauthorized(() =>
        controller.exchange({ apiKey: fullKey })
      );
    });

    it('should return the same generic error when user is missing', async () => {
      const { record, fullKey } = createMockKeyRecord();
      const { controller } = createController({
        findByPrefix: vi.fn().mockResolvedValue(record),
        dbSelect: [],
      });

      await expectGenericUnauthorized(() =>
        controller.exchange({ apiKey: fullKey })
      );
    });

    it('should log the real denial reason at warn level', async () => {
      const warnSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      try {
        const { controller } = createController({
          findByPrefix: vi.fn().mockResolvedValue(null),
        });

        await expect(
          controller.exchange({ apiKey: 'invalid_key_prefix_xxxxxxxx' })
        ).rejects.toThrow(UnauthorizedException);

        expect(warnSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'mcp.token_exchange.denied',
            reason: 'key_not_found',
          })
        );
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('key verification (static methods)', () => {
    it('should verify valid API key', () => {
      const { fullKey, hash } = McpKeysService.generateKeyParts('test');
      expect(McpKeysService.verifyKey(fullKey, hash)).toBe(true);
    });

    it('should reject invalid API key', () => {
      const { hash } = McpKeysService.generateKeyParts('test');
      expect(McpKeysService.verifyKey('invalid_key', hash)).toBe(false);
    });

    it('should extract prefix from full key', () => {
      const { fullKey, prefix } = McpKeysService.generateKeyParts('test');
      expect(fullKey.slice(0, 24)).toBe(prefix);
    });
  });
});
