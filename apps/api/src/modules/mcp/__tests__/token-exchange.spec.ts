import { UnauthorizedException } from '@nestjs/common';
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
      scopes: 'read',
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
      scopes: 'read',
    });

    expect(jwtService.signAsync).toHaveBeenCalledWith(
      {
        sub: record.userId,
        email: 'user@test.com',
        source: 'mcp',
        scopes: 'read',
      },
      { secret: 'test-secret', expiresIn: '15m' }
    );
  });

  it('should reject when key prefix is not found', async () => {
    const { controller } = createController({
      findByPrefix: vi.fn().mockResolvedValue(null),
    });

    await expect(
      controller.exchange({ apiKey: 'invalid_key_prefix_xxxxxxxx' })
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should reject when key hash does not match', async () => {
    const { record } = createMockKeyRecord();

    const { controller } = createController({
      findByPrefix: vi.fn().mockResolvedValue(record),
    });

    await expect(
      controller.exchange({ apiKey: record.keyPrefix + '_wrong_secret' })
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should reject when API key is expired', async () => {
    const pastDate = new Date('2020-01-01');
    const { record, fullKey } = createMockKeyRecord({
      expiresAt: pastDate,
    });

    const { controller } = createController({
      findByPrefix: vi.fn().mockResolvedValue(record),
    });

    await expect(controller.exchange({ apiKey: fullKey })).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('should reject when user is not found', async () => {
    const { record, fullKey } = createMockKeyRecord();

    const { controller } = createController({
      findByPrefix: vi.fn().mockResolvedValue(record),
      dbSelect: [],
    });

    await expect(controller.exchange({ apiKey: fullKey })).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('should embed scopes in JWT for write,share keys', async () => {
    const { record, fullKey } = createMockKeyRecord({
      scopes: 'read,write,share',
    });

    const { controller, jwtService } = createController({
      findByPrefix: vi.fn().mockResolvedValue(record),
      dbSelect: [{ id: record.userId, email: 'user@test.com' }],
    });

    await controller.exchange({ apiKey: fullKey });

    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'mcp', scopes: 'read,write,share' }),
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
