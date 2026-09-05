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
import { ByokService } from './byok.service';

vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({ usage: { outputTokens: 16 } }),
}));

const masterKeyB64 = randomBytes(32).toString('base64');
const masterKey = Buffer.from(masterKeyB64, 'base64');

interface MakeOverrides {
  flagOn?: boolean;
  identity?: IdentityState;
  validate?: (provider: ByokProvider, key: string) => Promise<void>;
  repo?: Partial<Record<string, ReturnType<typeof vi.fn>>>;
  settings?: Partial<Record<string, ReturnType<typeof vi.fn>>>;
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
  const flags = {
    isEnabled: vi.fn().mockResolvedValue(overrides.flagOn ?? true),
  };
  const config = {
    get: (k: string) =>
      k === 'BYOK_ENCRYPTION_KEY' ? masterKeyB64 : undefined,
  };
  const registry = { languageModel: vi.fn() };
  const settings = {
    getSettings: vi
      .fn()
      .mockResolvedValue({ preferredModel: null, preferredIntent: null }),
    patchSettings: vi.fn().mockResolvedValue(undefined),
    ...overrides.settings,
  };
  const service = new ByokService(
    repo as never,
    flags as never,
    config as never,
    registry as never,
    policyFor(overrides.identity ?? IDENTITY_STATE.VERIFIED),
    settings as never
  );
  const validateKey = vi.fn(overrides.validate ?? (async () => undefined));
  (service as never as { validateKey: unknown }).validateKey = validateKey;
  return { service, repo, flags, store, validateKey, settings };
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
      validate: async () => {
        throw new Error('401 unauthorized');
      },
    });
    await expect(service.setKey('u1', 'openai', 'bad')).rejects.toBeInstanceOf(
      UnprocessableEntityException
    );
  });

  it('throws 503 when no master key is configured', async () => {
    const { service } = makeService({});
    (service as never as { masterKey: Buffer | null }).masterKey = null;
    await expect(
      service.setKey('u1', 'anthropic', 'sk-ant')
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('enabledProviders is empty when anonymous or flag off', async () => {
    const off = makeService({ flagOn: false });
    expect((await off.service.enabledProviders('u1')).size).toBe(0);
    const on = makeService({ flagOn: true });
    expect((await on.service.enabledProviders('u1', true)).size).toBe(0);
  });

  it('getApiKey decrypts a stored key', async () => {
    const { service } = makeService({
      repo: {
        getEncrypted: vi.fn().mockResolvedValue({
          ...encryptSecret('sk-live', masterKey),
          keyPrefix: 'sk-live',
        }),
      },
      flagOn: true,
    });
    expect(await service.getApiKey('u1', 'anthropic')).toBe('sk-live');
  });

  it('getApiKey returns null when decryption fails', async () => {
    const { service } = makeService({
      repo: {
        getEncrypted: vi.fn().mockResolvedValue({
          ciphertext: 'bad',
          iv: 'x',
          authTag: 'y',
          keyPrefix: 'p',
        }),
      },
      flagOn: true,
    });
    expect(await service.getApiKey('u1', 'anthropic')).toBeNull();
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
    const flags = { isEnabled: vi.fn().mockResolvedValue(true) };
    const config = {
      get: (k: string) =>
        k === 'BYOK_ENCRYPTION_KEY' ? masterKeyB64 : undefined,
    };
    const registry = { languageModel: vi.fn().mockReturnValue({}) };
    const service = new ByokService(
      repo as never,
      flags as never,
      config as never,
      registry as never,
      policyFor(IDENTITY_STATE.VERIFIED),
      {
        getSettings: vi
          .fn()
          .mockResolvedValue({ preferredModel: null, preferredIntent: null }),
        patchSettings: vi.fn(),
      } as never
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
    const flags = { isEnabled: vi.fn().mockResolvedValue(true) };
    const service = new ByokService(
      repo as never,
      flags as never,
      config as never,
      registry as never,
      policyFor(IDENTITY_STATE.VERIFIED),
      {
        getSettings: vi
          .fn()
          .mockResolvedValue({ preferredModel: null, preferredIntent: null }),
        patchSettings: vi.fn(),
      } as never
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
      validate: vi
        .fn()
        .mockRejectedValue(
          new Error('Incorrect API key provided: sk-proj-ABCDEF1234567890')
        ),
    });

    await expect(service.setKey('user-1', 'openai', 'sk-bad')).rejects.toThrow(
      UnprocessableEntityException
    );

    const loggedPayloads = warn.mock.calls.map((c) => JSON.stringify(c[0]));
    expect(loggedPayloads.some((p) => p.includes('sk-proj'))).toBe(false);
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

    it('stores a key for an unverified user while the gate flag is off', async () => {
      const { service, repo, store } = makeService({
        identity: IDENTITY_STATE.GATE_OFF,
      });

      await service.setKey('u1', 'anthropic', 'sk-ant-supersecret-12345');

      expectKeyStoredForU1(repo, store);
    });

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
    it('drops a preferred model billed to the deleted key', async () => {
      const { service, repo, settings } = makeService({
        settings: {
          getSettings: vi.fn().mockResolvedValue({
            preferredModel: 'openai:gpt-6',
            preferredIntent: 'fast',
          }),
        },
      });

      await service.deleteKey('u1', 'openai');

      expect(repo.remove).toHaveBeenCalledWith('u1', 'openai');
      expect(settings.patchSettings).toHaveBeenCalledWith('u1', {
        preferredModel: null,
      });
    });

    it('leaves a preferred model on another provider alone', async () => {
      const { service, settings } = makeService({
        settings: {
          getSettings: vi.fn().mockResolvedValue({
            preferredModel: 'anthropic:claude-sonnet-5',
            preferredIntent: null,
          }),
        },
      });

      await service.deleteKey('u1', 'openai');

      expect(settings.patchSettings).not.toHaveBeenCalled();
    });
  });
});
