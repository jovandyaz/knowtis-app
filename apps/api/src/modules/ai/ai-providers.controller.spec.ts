import {
  BadRequestException,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
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

import { AiProvidersController } from './ai-providers.controller';
import {
  PROVIDER_LISTING_KIND,
  type ProviderListing,
  type ProviderModelsLister,
} from './domain/ports/provider-models.port';

const user = { id: 'admin-1' } as never;
const anthropic = { provider: 'anthropic' } as never;
const ROUTING_KEY = 'sk-ant-routing-key-0001';
const LISTED_MODEL_IDS = ['claude-haiku-4-5-20251001', 'claude-sonnet-5'];

const LISTED: ProviderListing = {
  kind: PROVIDER_LISTING_KIND.LISTED,
  modelIds: LISTED_MODEL_IDS,
};
const REJECTED: ProviderListing = {
  kind: PROVIDER_LISTING_KIND.REJECTED,
  error: 'HTTP 401: invalid x-api-key',
};
const UNAVAILABLE: ProviderListing = {
  kind: PROVIDER_LISTING_KIND.UNAVAILABLE,
  error: 'HTTP 529: Overloaded',
};

function make(
  listing: ProviderListing = LISTED,
  routingKey: string | null = ROUTING_KEY
) {
  const systemKeys = {
    list: vi.fn().mockResolvedValue([]),
    setKey: vi.fn().mockResolvedValue({ valid: true }),
    setEnabled: vi.fn().mockResolvedValue(undefined),
    clearKey: vi.fn().mockResolvedValue(undefined),
  };
  const registry = {
    refreshSystemConfigs: vi.fn().mockResolvedValue(undefined),
    routingKey: vi.fn().mockReturnValue(routingKey),
  };
  const lister: { list: Mock<ProviderModelsLister['list']> } = {
    list: vi.fn<ProviderModelsLister['list']>().mockResolvedValue(listing),
  };
  return {
    controller: new AiProvidersController(
      systemKeys as never,
      registry as never,
      lister
    ),
    systemKeys,
    registry,
    lister,
  };
}

describe('AiProvidersController', () => {
  let warn: MockInstance<Logger['warn']>;

  beforeEach(() => {
    vi.clearAllMocks();
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('should reject a request that changes nothing', async () => {
    const { controller, systemKeys } = make();

    await expect(controller.set(user, anthropic, {})).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(systemKeys.setKey).not.toHaveBeenCalled();
    expect(systemKeys.setEnabled).not.toHaveBeenCalled();
  });

  it('should store a key and surface the probe verdict', async () => {
    const { controller, systemKeys } = make();

    const result = await controller.set(user, anthropic, {
      apiKey: 'sk-ant-good',
    });

    expect(systemKeys.setKey).toHaveBeenCalledWith(
      'anthropic',
      'sk-ant-good',
      'admin-1'
    );
    expect(result.probe).toEqual({ valid: true });
    expect(result.providers).toEqual([]);
  });

  it('should refresh routing before reporting what is applied', async () => {
    const { controller, registry, systemKeys } = make();

    await controller.set(user, anthropic, { enabled: false });

    expect(registry.refreshSystemConfigs).toHaveBeenCalled();
    expect(systemKeys.list.mock.invocationCallOrder[0]).toBeGreaterThan(
      registry.refreshSystemConfigs.mock.invocationCallOrder[0]
    );
  });

  describe('listing on save', () => {
    it('should keep a key the provider could not vet and report why', async () => {
      const { controller, systemKeys } = make();
      systemKeys.setKey.mockResolvedValue({
        valid: false,
        error: UNAVAILABLE.error,
      });

      const result = await controller.set(user, anthropic, {
        apiKey: 'sk-ant-doubtful',
      });

      expect(systemKeys.setKey).toHaveBeenCalledWith(
        'anthropic',
        'sk-ant-doubtful',
        'admin-1'
      );
      expect(result.probe).toEqual({ valid: false, error: UNAVAILABLE.error });
    });

    it('should propagate a veto without refreshing routing', async () => {
      const { controller, systemKeys, registry } = make();
      systemKeys.setKey.mockRejectedValue(
        new UnprocessableEntityException({
          message: 'anthropic refused the key: HTTP 401: invalid x-api-key',
          code: 'rejected',
        })
      );

      await expect(
        controller.set(user, anthropic, { apiKey: 'sk-ant-bad' })
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(registry.refreshSystemConfigs).not.toHaveBeenCalled();
    });

    it('should not attach a probe when only enablement changes', async () => {
      const { controller, systemKeys } = make();

      const result = await controller.set(user, anthropic, { enabled: false });

      expect(systemKeys.setKey).not.toHaveBeenCalled();
      expect(systemKeys.setEnabled).toHaveBeenCalledWith(
        'anthropic',
        false,
        'admin-1'
      );
      expect(result.probe).toBeUndefined();
    });
  });

  describe('test connection', () => {
    it('lists the key that currently routes, not a candidate', async () => {
      const { controller, registry, lister } = make();

      await controller.test(anthropic);

      expect(registry.routingKey).toHaveBeenCalledWith('anthropic');
      expect(lister.list).toHaveBeenCalledTimes(1);
      expect(lister.list).toHaveBeenCalledWith('anthropic', ROUTING_KEY);
    });

    it('reports how many models the key lists', async () => {
      const { controller } = make();

      await expect(controller.test(anthropic)).resolves.toEqual({
        ok: true,
        modelCount: LISTED_MODEL_IDS.length,
      });
    });

    it('reports a valid key whose list is unknown without a count', async () => {
      const { controller } = make({
        kind: PROVIDER_LISTING_KIND.LISTED,
        modelIds: null,
      });

      await expect(controller.test(anthropic)).resolves.toEqual({
        ok: true,
        modelCount: null,
      });
    });

    it("reports a refusal in the provider's words", async () => {
      const { controller } = make(REJECTED);

      await expect(controller.test(anthropic)).resolves.toEqual({
        ok: false,
        reason: 'rejected',
        message: 'anthropic refused the key: HTTP 401: invalid x-api-key',
      });
      expect(warn.mock.calls.map((call) => call[0])).toEqual([
        {
          event: 'system_provider_key.test_failed',
          provider: 'anthropic',
          reason: 'rejected',
          error: REJECTED.error,
        },
      ]);
    });

    // Redaction is the lister's contract, so the mock answers as the real one
    // does; the controller relays that error as is.
    it('keeps the routing key out of a refusal it reports', async () => {
      const redacted = {
        kind: PROVIDER_LISTING_KIND.REJECTED,
        error: 'HTTP 401: Incorrect API key provided: [redacted].',
      } as const;
      const { controller } = make(redacted);

      const result = await controller.test(anthropic);

      expect(result).toEqual({
        ok: false,
        reason: 'rejected',
        message: `anthropic refused the key: ${redacted.error}`,
      });
      expect(JSON.stringify(result)).not.toContain(ROUTING_KEY);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(ROUTING_KEY);
    });

    it('reports unavailable without blaming the key', async () => {
      const { controller } = make(UNAVAILABLE);

      await expect(controller.test(anthropic)).resolves.toEqual({
        ok: false,
        reason: 'unavailable',
        message: 'anthropic is unavailable right now. Retry shortly.',
      });
      expect(warn.mock.calls.map((call) => call[0])).toEqual([
        {
          event: 'system_provider_key.test_failed',
          provider: 'anthropic',
          reason: 'unavailable',
          error: UNAVAILABLE.error,
        },
      ]);
    });

    it('reports unconfigured, without a request, when no key routes directly', async () => {
      const { controller, lister } = make(LISTED, null);

      await expect(controller.test(anthropic)).resolves.toEqual({
        ok: false,
        reason: 'unconfigured',
        message:
          'No anthropic key routes directly: store one or enable the provider',
      });
      expect(lister.list).not.toHaveBeenCalled();
    });
  });

  describe('throttling', () => {
    it.each(['list', 'set', 'clearKey', 'test'] as const)(
      'should throttle %s',
      (route) => {
        expect(
          Reflect.getMetadata(
            'THROTTLER:LIMITdefault',
            AiProvidersController.prototype[route]
          )
        ).toBeDefined();
      }
    );
  });
});
