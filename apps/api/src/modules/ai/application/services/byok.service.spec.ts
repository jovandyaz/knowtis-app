import { randomBytes } from 'node:crypto';

import {
  HttpStatus,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { generateText } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EMAIL_NOT_VERIFIED_CODE,
  type ByokProvider,
} from '@knowtis/shared-types';

import {
  IDENTITY_STATE,
  policyFor,
  type IdentityState,
} from '../../../../test-support/verified-identity';
import {
  decryptSecret,
  encryptSecret,
} from '../../infrastructure/crypto/secret-cipher';
import type { ProbeResult } from '../../infrastructure/providers/provider-probe';
import { ByokService } from './byok.service';

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn().mockResolvedValue({ usage: { outputTokens: 16 } }),
}));

const masterKeyB64 = randomBytes(32).toString('base64');
const masterKey = Buffer.from(masterKeyB64, 'base64');

interface MakeOverrides {
  identity?: IdentityState;
  validate?: (provider: ByokProvider, key: string) => Promise<ProbeResult>;
  realProbe?: boolean;
  repo?: Partial<Record<string, ReturnType<typeof vi.fn>>>;
}

function makeService(overrides: MakeOverrides) {
  const store = new Map<string, unknown>();
  const repo = {
    listForUser: vi.fn().mockResolvedValue([]),
    getEnabledProviders: vi.fn().mockResolvedValue([]),
    getEncrypted: vi.fn().mockResolvedValue(null),
    upsert: vi.fn(
      async (_u: string, _p: ByokProvider, secret: unknown, prefix: string) => {
        store.set('secret', secret);
        store.set('prefix', prefix);
      }
    ),
    remove: vi.fn(),
    touchLastUsed: vi.fn(),
    ...overrides.repo,
  };
  const config = {
    get: (k: string) =>
      k === 'BYOK_ENCRYPTION_KEY' ? masterKeyB64 : undefined,
  };
  const registry = { languageModel: vi.fn() };
  const settings = {
    clearBoundToUnheldProvider: vi.fn().mockResolvedValue(undefined),
  };
  const service = new ByokService(
    repo as never,
    config as never,
    registry as never,
    policyFor(overrides.identity ?? IDENTITY_STATE.VERIFIED),
    settings as never
  );
  const validateKey = vi.fn(
    overrides.validate ?? (async () => ({ valid: true }) as ProbeResult)
  );
  if (!overrides.realProbe) {
    (service as never as { validateKey: unknown }).validateKey = validateKey;
  }
  return { service, repo, store, validateKey, settings };
}

describe('ByokService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('encrypts on setKey and stores a masked prefix', async () => {
    const { service, store } = makeService({});
    await service.setKey('u1', 'anthropic', 'sk-ant-supersecret-12345');
    expect(store.get('prefix')).toBe('sk-ant-s');
    expect(decryptSecret(store.get('secret') as never, masterKey)).toBe(
      'sk-ant-supersecret-12345'
    );
  });

  it('rejects an invalid key with 422', async () => {
    const { service } = makeService({
      validate: async () => ({
        valid: false,
        reason: 'rejected',
        error: '401 unauthorized',
      }),
    });
    await expect(service.setKey('u1', 'openai', 'bad')).rejects.toBeInstanceOf(
      UnprocessableEntityException
    );
  });

  it.each(['unavailable', 'timeout'] as const)(
    'answers 503, not 422, when the probe is %s',
    async (reason) => {
      const { service, repo } = makeService({
        validate: async () => ({ valid: false, reason, error: 'boom' }),
      });
      const failure = await service
        .setKey('u1', 'openai', 'sk-good-123456')
        .catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect((failure as Error).message).toMatch(/could not be reached/i);
      expect(repo.upsert).not.toHaveBeenCalled();
    }
  );

  it.each(['rejected', 'unavailable', 'timeout'] as const)(
    'logs provider, reason and error when the probe is %s',
    async (reason) => {
      const warn = vi
        .spyOn((await import('@nestjs/common')).Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const { service } = makeService({
        validate: async () => ({
          valid: false,
          reason,
          error: 'why it failed',
        }),
      });
      await service.setKey('u1', 'openai', 'sk-x-123456').catch(() => null);
      expect(warn).toHaveBeenCalledWith({
        event: 'byok.validation_failed',
        provider: 'openai',
        reason,
        error: 'why it failed',
      });
      warn.mockRestore();
    }
  );

  it('throws 503 when no master key is configured', async () => {
    const { service } = makeService({});
    (service as never as { masterKey: Buffer | null }).masterKey = null;
    await expect(
      service.setKey('u1', 'anthropic', 'sk-ant')
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('enabledProviders is empty when anonymous', async () => {
    const { service } = makeService({});
    expect((await service.enabledProviders('u1', true)).size).toBe(0);
  });

  it('enabledProviders lists the stored providers for a registered user', async () => {
    const { service } = makeService({
      repo: { getEnabledProviders: vi.fn().mockResolvedValue(['openai']) },
    });
    expect([...(await service.enabledProviders('u1'))]).toEqual(['openai']);
  });

  it('resolveKey finds and decrypts a stored key', async () => {
    const { service } = makeService({
      repo: {
        getEncrypted: vi.fn().mockResolvedValue({
          ...encryptSecret('sk-live', masterKey),
          keyPrefix: 'sk-live',
        }),
      },
    });
    expect(await service.resolveKey('u1', 'anthropic')).toEqual({
      kind: 'found',
      apiKey: 'sk-live',
    });
  });

  it('resolveKey reports a key that no longer decrypts', async () => {
    const { service } = makeService({
      repo: {
        getEncrypted: vi.fn().mockResolvedValue({
          ciphertext: 'bad',
          iv: 'x',
          authTag: 'y',
          keyPrefix: 'p',
        }),
      },
    });
    expect(await service.resolveKey('u1', 'anthropic')).toEqual({
      kind: 'undecryptable',
    });
  });

  it('resolveKey reports a key deleted since the tier was resolved', async () => {
    const { service } = makeService({
      repo: { getEncrypted: vi.fn().mockResolvedValue(null) },
    });
    expect(await service.resolveKey('u1', 'anthropic')).toEqual({
      kind: 'missing',
    });
  });

  it('validates the key against a provider that rejects maxOutputTokens below 16 (OpenAI minimum)', async () => {
    // Mimic OpenAI's Responses API, which rejects max_output_tokens < 16. setKey
    // must succeed, proving validateKey never probes with a value below 16.
    vi.mocked(generateText).mockImplementation((async (opts: {
      maxOutputTokens?: number;
    }) => {
      if ((opts.maxOutputTokens ?? 0) < 16) {
        throw new Error('integer below minimum value. Expected a value >= 16');
      }
      return { usage: { outputTokens: 16 } };
    }) as never);
    const store = new Map<string, unknown>();
    const repo = {
      listForUser: vi.fn().mockResolvedValue([]),
      getEnabledProviders: vi.fn().mockResolvedValue([]),
      getEncrypted: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(
        async (
          _u: string,
          _p: ByokProvider,
          secret: unknown,
          prefix: string
        ) => {
          store.set('secret', secret);
          store.set('prefix', prefix);
        }
      ),
      remove: vi.fn(),
      touchLastUsed: vi.fn(),
    };
    const config = {
      get: (k: string) =>
        k === 'BYOK_ENCRYPTION_KEY' ? masterKeyB64 : undefined,
    };
    const registry = { languageModel: vi.fn().mockReturnValue({}) };
    const service = new ByokService(
      repo as never,
      config as never,
      registry as never,
      policyFor(IDENTITY_STATE.VERIFIED),
      { clearBoundToUnheldProvider: vi.fn() } as never
    );

    await expect(
      service.setKey('u1', 'openai', 'sk-valid-123456')
    ).resolves.toBeUndefined();
    expect(repo.upsert).toHaveBeenCalled();
  });

  it('validates an openrouter key against the first open-tier model', async () => {
    const registry = { languageModel: vi.fn().mockReturnValue({}) };
    const config = {
      get: (k: string) =>
        k === 'BYOK_ENCRYPTION_KEY' ? masterKeyB64 : undefined,
    };
    const repo = {
      listForUser: vi.fn().mockResolvedValue([]),
      getEnabledProviders: vi.fn().mockResolvedValue([]),
      getEncrypted: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
      remove: vi.fn(),
      touchLastUsed: vi.fn(),
    };
    const service = new ByokService(
      repo as never,
      config as never,
      registry as never,
      policyFor(IDENTITY_STATE.VERIFIED),
      { clearBoundToUnheldProvider: vi.fn() } as never
    );

    await service.setKey('u1', 'openrouter', 'sk-or-v1-valid-key-000');

    expect(registry.languageModel).toHaveBeenCalledWith(
      'openrouter:deepseek/deepseek-v3.2',
      'sk-or-v1-valid-key-000'
    );
  });

  it('does not log the raw provider error when key validation fails', async () => {
    const warn = vi
      .spyOn((await import('@nestjs/common')).Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const { service } = makeService({
      realProbe: true,
    });
    vi.mocked(generateText).mockRejectedValueOnce(
      Object.assign(
        new Error('Incorrect API key provided: sk-proj-ABCDEF1234567890'),
        {}
      )
    );

    await expect(
      service.setKey('user-1', 'openai', 'sk-proj-ABCDEF1234567890')
    ).rejects.toThrow(ServiceUnavailableException);

    const loggedPayloads = warn.mock.calls.map((c) => JSON.stringify(c[0]));
    expect(loggedPayloads.some((p) => p.includes('sk-proj'))).toBe(false);
    expect(loggedPayloads.some((p) => p.includes('[redacted]'))).toBe(true);
    expect(
      loggedPayloads.some((p) => p.includes('byok.validation_failed'))
    ).toBe(true);
    warn.mockRestore();
  });

  describe('verified email gate', () => {
    const expectKeyStoredForU1 = (
      repo: { upsert: ReturnType<typeof vi.fn> },
      store: Map<string, unknown>
    ) => {
      expect(repo.upsert).toHaveBeenCalledWith(
        'u1',
        'anthropic',
        expect.anything(),
        'sk-ant-s'
      );
      expect(decryptSecret(store.get('secret') as never, masterKey)).toBe(
        'sk-ant-supersecret-12345'
      );
    };

    it('refuses an unverified user with EMAIL_NOT_VERIFIED and stores nothing', async () => {
      const { service, repo, validateKey } = makeService({
        identity: IDENTITY_STATE.UNVERIFIED,
      });

      await expect(
        service.setKey('u1', 'anthropic', 'sk-ant-supersecret-12345')
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: { code: EMAIL_NOT_VERIFIED_CODE },
      });
      expect(validateKey).not.toHaveBeenCalled();
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('stores a key for a verified user', async () => {
      const { service, repo, store } = makeService({
        identity: IDENTITY_STATE.VERIFIED,
      });

      await service.setKey('u1', 'anthropic', 'sk-ant-supersecret-12345');

      expectKeyStoredForU1(repo, store);
    });
  });

  describe('deleteKey', () => {
    it('removes the key, then clears the settings bound to it only while no key is stored', async () => {
      const { service, repo, settings } = makeService({});

      await service.deleteKey('u1', 'openai');

      expect(repo.remove).toHaveBeenCalledWith('u1', 'openai');
      expect(settings.clearBoundToUnheldProvider.mock.calls).toEqual([
        ['u1', 'openai'],
      ]);
      expect(repo.remove.mock.invocationCallOrder[0]).toBeLessThan(
        settings.clearBoundToUnheldProvider.mock.invocationCallOrder[0] ?? 0
      );
    });
  });

  describe('setKey and the settings bound to its provider', () => {
    it('clears the settings bound to an unheld provider before storing its key', async () => {
      const { service, repo, settings } = makeService({});

      await service.setKey('u1', 'openai', 'sk-openai-key-123456');

      expect(settings.clearBoundToUnheldProvider.mock.calls).toEqual([
        ['u1', 'openai'],
      ]);
      expect(
        settings.clearBoundToUnheldProvider.mock.invocationCallOrder[0]
      ).toBeLessThan(repo.upsert.mock.invocationCallOrder[0] ?? 0);
    });

    it('touches no settings when the provider rejects the key', async () => {
      const { service, settings } = makeService({
        validate: async () => ({
          valid: false,
          reason: 'rejected',
          error: '401 unauthorized',
        }),
      });

      await expect(
        service.setKey('u1', 'openai', 'sk-bad')
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(settings.clearBoundToUnheldProvider).not.toHaveBeenCalled();
    });
  });
});
