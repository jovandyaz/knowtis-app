import { randomBytes } from 'node:crypto';

import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ByokProvider } from '@knowtis/shared-types';

import {
  decryptSecret,
  encryptSecret,
} from '../../infrastructure/crypto/secret-cipher';
import { ByokService } from './byok.service';

const masterKeyB64 = randomBytes(32).toString('base64');
const masterKey = Buffer.from(masterKeyB64, 'base64');

interface MakeOverrides {
  flagOn?: boolean;
  validate?: (provider: ByokProvider, key: string) => Promise<void>;
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
  const flags = {
    isEnabled: vi.fn().mockResolvedValue(overrides.flagOn ?? true),
  };
  const config = {
    get: (k: string) =>
      k === 'BYOK_ENCRYPTION_KEY' ? masterKeyB64 : undefined,
  };
  const registry = { languageModel: vi.fn() };
  const service = new ByokService(
    repo as never,
    flags as never,
    config as never,
    registry as never
  );
  (service as never as { validateKey: unknown }).validateKey =
    overrides.validate ?? (async () => undefined);
  return { service, repo, flags, store };
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
});
