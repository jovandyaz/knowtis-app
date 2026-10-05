import { Logger, UnprocessableEntityException } from '@nestjs/common';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest';

import type { AIProvider } from '@knowtis/shared-types';

import {
  PROVIDER_LISTING_KIND,
  type ProviderListing,
  type ProviderModelsLister,
} from '../../domain/ports/provider-models.port';
import { encryptSecret } from '../../infrastructure/crypto/secret-cipher';
import { SystemProviderKeysService } from './system-provider-keys.service';

const MASTER_KEY = Buffer.alloc(32, 7);
const MASTER_KEY_B64 = MASTER_KEY.toString('base64');
const ACTOR = 'admin-user-id';

const LISTED: ProviderListing = {
  kind: PROVIDER_LISTING_KIND.LISTED,
  modelIds: ['claude-haiku-4-5-20251001'],
};
const REJECTED: ProviderListing = {
  kind: PROVIDER_LISTING_KIND.REJECTED,
  error: 'HTTP 401: invalid x-api-key',
};
const UNAVAILABLE: ProviderListing = {
  kind: PROVIDER_LISTING_KIND.UNAVAILABLE,
  error: 'The listing timed out',
};

function rowFor(provider: AIProvider, apiKey: string | null, enabled = true) {
  return {
    provider,
    enabled,
    secret: apiKey ? encryptSecret(apiKey, MASTER_KEY) : null,
    keyPrefix: apiKey ? apiKey.slice(0, 8) : null,
    updatedAt: new Date('2026-07-17T00:00:00.000Z'),
  };
}

function undecryptableRow(provider: AIProvider) {
  return {
    ...rowFor(provider, 'sk-stored'),
    secret: { ciphertext: 'bogus', iv: 'bogus', authTag: 'bogus' },
  };
}

describe('SystemProviderKeysService', () => {
  let service: SystemProviderKeysService;
  let mockRepo: {
    getAll: ReturnType<typeof vi.fn>;
    setKey: ReturnType<typeof vi.fn>;
    setEnabled: ReturnType<typeof vi.fn>;
    clearKey: ReturnType<typeof vi.fn>;
  };
  let mockAudit: { record: ReturnType<typeof vi.fn> };
  let env: Record<string, string>;
  let lister: { list: Mock<ProviderModelsLister['list']> };
  let warn: MockInstance<Logger['warn']>;

  function build(masterKey: string | null = MASTER_KEY_B64) {
    const configService = {
      get: vi.fn((key: string) =>
        key === 'BYOK_ENCRYPTION_KEY' ? masterKey : env[key]
      ),
    };
    return new SystemProviderKeysService(
      mockRepo as never,
      configService as never,
      mockAudit as never,
      lister
    );
  }

  afterEach(() => {
    warn.mockRestore();
  });

  beforeEach(() => {
    env = {};
    mockRepo = {
      getAll: vi.fn().mockResolvedValue([]),
      setKey: vi.fn(),
      setEnabled: vi.fn(),
      clearKey: vi.fn(),
    };
    mockAudit = { record: vi.fn().mockResolvedValue(undefined) };
    lister = {
      list: vi.fn<ProviderModelsLister['list']>().mockResolvedValue(LISTED),
    };
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    service = build();
  });

  describe('getSystemProviderConfigs', () => {
    it('should decrypt a stored key', async () => {
      mockRepo.getAll.mockResolvedValue([rowFor('openrouter', 'sk-or-secret')]);

      const configs = await service.getSystemProviderConfigs();

      expect(configs.get('openrouter')).toEqual({
        enabled: true,
        apiKey: 'sk-or-secret',
      });
    });

    it('should surface enablement without a key', async () => {
      mockRepo.getAll.mockResolvedValue([rowFor('openai', null, false)]);

      const configs = await service.getSystemProviderConfigs();

      expect(configs.get('openai')).toEqual({ enabled: false, apiKey: null });
    });

    it('should yield a null key when the stored secret cannot be decrypted', async () => {
      mockRepo.getAll.mockResolvedValue([undecryptableRow('openai')]);

      const configs = await service.getSystemProviderConfigs();

      expect(configs.get('openai')?.apiKey).toBeNull();
    });

    it('should yield null keys when no master key is configured', async () => {
      mockRepo.getAll.mockResolvedValue([rowFor('openrouter', 'sk-or-secret')]);

      const configs = await build(null).getSystemProviderConfigs();

      expect(configs.get('openrouter')?.apiKey).toBeNull();
    });
  });

  describe('list', () => {
    it('should report a stored key as database-sourced with only its prefix', async () => {
      mockRepo.getAll.mockResolvedValue([
        rowFor('openrouter', 'sk-or-v1-secret'),
      ]);

      const entry = (await service.list()).find(
        (p) => p.provider === 'openrouter'
      );

      expect(entry).toEqual({
        provider: 'openrouter',
        enabled: true,
        keySource: 'database',
        storedKeyUnreadable: false,
        keyPrefix: 'sk-or-v1',
        updatedAt: '2026-07-17T00:00:00.000Z',
      });
    });

    it('should fall back to environment when no row stores a key', async () => {
      env['ANTHROPIC_API_KEY'] = 'sk-ant-env';

      const entry = (await service.list()).find(
        (p) => p.provider === 'anthropic'
      );

      expect(entry?.keySource).toBe('environment');
      expect(entry?.enabled).toBe(true);
    });

    it('should report none when neither database nor environment has a key', async () => {
      const entry = (await service.list()).find((p) => p.provider === 'google');

      expect(entry?.keySource).toBe('none');
    });

    it('should report an undecryptable row as the env source it actually routes from', async () => {
      env['OPENAI_API_KEY'] = 'sk-openai-env';
      mockRepo.getAll.mockResolvedValue([undecryptableRow('openai')]);

      const entry = (await service.list()).find((p) => p.provider === 'openai');

      expect(entry?.keySource).toBe('environment');
      expect(entry?.storedKeyUnreadable).toBe(true);
    });

    it('should report an undecryptable row with no env fallback as routing nothing', async () => {
      mockRepo.getAll.mockResolvedValue([undecryptableRow('openai')]);

      const entry = (await service.list()).find((p) => p.provider === 'openai');

      expect(entry?.keySource).toBe('none');
      expect(entry?.storedKeyUnreadable).toBe(true);
    });

    it('should list every known provider', async () => {
      const providers = (await service.list()).map((p) => p.provider);

      expect(providers).toEqual([
        'anthropic',
        'openai',
        'google',
        'openrouter',
      ]);
    });
  });

  describe('setKey', () => {
    it('should store an encrypted key and audit only its prefix with the probe verdict', async () => {
      await service.setKey('openrouter', 'sk-or-v1-secret', ACTOR);

      const [provider, secret, keyPrefix, actorId] =
        mockRepo.setKey.mock.calls[0];
      expect(provider).toBe('openrouter');
      expect(keyPrefix).toBe('sk-or-v1');
      expect(actorId).toBe(ACTOR);
      expect(JSON.stringify(secret)).not.toContain('sk-or-v1-secret');
      expect(mockAudit.record).toHaveBeenCalledWith({
        actorId: ACTOR,
        action: 'ai_provider.key_set',
        targetType: 'ai_provider',
        targetId: 'openrouter',
        after: { keyPrefix: 'sk-or-v1', probe: 'passed' },
      });
    });

    it('should reject storing a key when no master key is configured', async () => {
      await expect(
        build(null).setKey('openrouter', 'sk-or-v1-secret', ACTOR)
      ).rejects.toThrow('BYOK_ENCRYPTION_KEY is not configured');
      expect(mockRepo.setKey).not.toHaveBeenCalled();
      expect(lister.list).not.toHaveBeenCalled();
    });

    it.each([
      ['with its models', LISTED],
      [
        'with its list unknown',
        { kind: PROVIDER_LISTING_KIND.LISTED, modelIds: null } as const,
      ],
    ])(
      'stores and audits a key the listing accepts: %s',
      async (_case, listing) => {
        lister.list.mockResolvedValue(listing);

        await expect(
          service.setKey('anthropic', 'sk-ant-good-key', ACTOR)
        ).resolves.toEqual({ valid: true });

        expect(lister.list).toHaveBeenCalledWith(
          'anthropic',
          'sk-ant-good-key'
        );
        expect(mockRepo.setKey).toHaveBeenCalledWith(
          'anthropic',
          expect.anything(),
          'sk-ant-g',
          ACTOR
        );
        expect(mockAudit.record).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'ai_provider.key_set',
            after: { keyPrefix: 'sk-ant-g', probe: 'passed' },
          })
        );
        expect(warn).not.toHaveBeenCalled();
      }
    );

    it('vetoes a key the provider refused and stores nothing', async () => {
      lister.list.mockResolvedValue(REJECTED);

      await expect(
        service.setKey('anthropic', 'sk-ant-bad-key', ACTOR)
      ).rejects.toMatchObject({
        constructor: UnprocessableEntityException,
        response: {
          message: 'anthropic refused the key: HTTP 401: invalid x-api-key',
          code: 'rejected',
        },
      });

      expect(mockRepo.setKey).not.toHaveBeenCalled();
      expect(mockAudit.record).not.toHaveBeenCalled();
      expect(warn.mock.calls.map((call) => call[0])).toEqual([
        {
          event: 'system_provider_key.probe_failed',
          provider: 'anthropic',
          reason: 'rejected',
          error: REJECTED.error,
        },
      ]);
    });

    it('keeps a key the provider could not be reached to check and reports why', async () => {
      lister.list.mockResolvedValue(UNAVAILABLE);

      await expect(
        service.setKey('anthropic', 'sk-ant-maybe-key', ACTOR)
      ).resolves.toEqual({ valid: false, error: UNAVAILABLE.error });

      expect(mockRepo.setKey).toHaveBeenCalledWith(
        'anthropic',
        expect.anything(),
        'sk-ant-m',
        ACTOR
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ai_provider.key_set',
          after: { keyPrefix: 'sk-ant-m', probe: 'unavailable' },
        })
      );
      expect(warn.mock.calls.map((call) => call[0])).toEqual([
        {
          event: 'system_provider_key.probe_failed',
          provider: 'anthropic',
          reason: 'unavailable',
          error: UNAVAILABLE.error,
        },
      ]);
    });
  });

  describe('clearKey', () => {
    it('should audit a cleared key', async () => {
      mockRepo.clearKey.mockResolvedValue(true);

      await service.clearKey('openrouter', ACTOR);

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ai_provider.key_cleared',
          targetId: 'openrouter',
        })
      );
    });

    it('should not audit when no stored key existed', async () => {
      mockRepo.clearKey.mockResolvedValue(false);

      await service.clearKey('openrouter', ACTOR);

      expect(mockAudit.record).not.toHaveBeenCalled();
    });
  });

  it('should audit an enablement change', async () => {
    await service.setEnabled('openai', false, ACTOR);

    expect(mockRepo.setEnabled).toHaveBeenCalledWith('openai', false, ACTOR);
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ai_provider.enabled_changed',
        targetId: 'openai',
        after: { enabled: false },
      })
    );
  });
});
