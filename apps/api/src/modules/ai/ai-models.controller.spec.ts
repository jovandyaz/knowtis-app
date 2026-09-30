import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AiModelsController } from './ai-models.controller';
import { ModelPreferenceService } from './application/services/model-preference.service';
import { SelectableModelsService } from './application/services/selectable-models.service';
import type { TierResolver } from './application/services/tier-resolver.service';
import { AiUnavailableError } from './domain/errors/ai-unavailable.error';
import { ModelUnavailableException } from './model-unavailable.exception';
import { createExecutionContext } from './testing/create-execution-context';

const user = { id: 'u1' } as never;
const req = { ip: '203.0.113.7', headers: {} } as never;
const CALLER = { userId: 'u1', isAnonymous: false };
const FREE_EXECUTION = createExecutionContext({ tier: 'free', userId: 'u1' });
const ENVELOPE = {
  tier: 'free',
  models: [{ id: 'openrouter:deepseek/deepseek-v3.2' }],
  intents: [],
};

function make() {
  const pref = {
    listModels: vi.fn().mockResolvedValue(ENVELOPE),
    getUserPreferences: vi.fn().mockResolvedValue({
      preferredModel: 'openai:gpt-4o-mini',
      preferredIntent: 'balanced',
      primaryProvider: null,
      ghostTextEnabled: true,
    }),
    setUserPreferences: vi.fn().mockResolvedValue(undefined),
  } satisfies Partial<Record<keyof ModelPreferenceService, unknown>>;
  const tiers = {
    resolve: vi.fn().mockResolvedValue(FREE_EXECUTION),
  } satisfies Partial<Record<keyof TierResolver, unknown>>;
  return {
    ctrl: new AiModelsController(pref as never, tiers as never),
    pref,
    tiers,
  };
}

/** The real preference service behind the controller, so a request shows when the tier is resolved. */
function makeWired(
  stored: {
    preferredModel: string | null;
    preferredIntent: 'fast' | 'balanced' | 'powerful' | null;
  } = { preferredModel: null, preferredIntent: null }
) {
  const selectable = new SelectableModelsService(
    {
      isSupported: () => true,
      getPricing: () => undefined,
      getContextWindow: () => undefined,
    },
    {
      isModelAvailable: (id: string) => id.startsWith('openrouter:'),
    } as never,
    { snapshot: () => [] } as never
  );
  const repo = {
    getSettings: vi.fn().mockResolvedValue({
      ...stored,
      primaryProvider: null,
      ghostTextEnabled: true,
    }),
    patchSettings: vi.fn().mockResolvedValue(undefined),
  };
  const aiConfig = {
    getIntentModels: vi.fn().mockResolvedValue({
      fast: 'openrouter:minimax/minimax-m2.5',
      balanced: 'openrouter:deepseek/deepseek-v3.2',
      powerful: 'openrouter:moonshotai/kimi-k2.5',
    }),
  };
  const tiers = {
    resolve: vi.fn().mockResolvedValue(FREE_EXECUTION),
  } satisfies Partial<Record<keyof TierResolver, unknown>>;
  const ctrl = new AiModelsController(
    new ModelPreferenceService(repo as never, selectable, aiConfig as never),
    tiers as never
  );
  return { ctrl, repo, tiers };
}

describe('AiModelsController', () => {
  it('GET /ai/models answers the envelope for the resolved tier', async () => {
    const { ctrl, pref, tiers } = make();
    const answered = await ctrl.listModels(user, req);
    expect(tiers.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', isAnonymous: false })
    );
    expect(pref.listModels).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'free' })
    );
    expect(answered).toBe(ENVELOPE);
  });

  it('GET /ai/models resolves the tier of an anonymous session with its client ip', async () => {
    const { ctrl, tiers } = make();
    await ctrl.listModels({ id: 'a1', isAnonymous: true } as never, req);
    expect(tiers.resolve).toHaveBeenCalledWith({
      userId: 'a1',
      isAnonymous: true,
      clientIp: '203.0.113.7',
    });
  });

  it('GET /ai/preferences returns both stored preferences', async () => {
    const { ctrl } = make();
    expect(await ctrl.getPreferences(user, req)).toEqual({
      preferredModel: 'openai:gpt-4o-mini',
      preferredIntent: 'balanced',
      primaryProvider: null,
      ghostTextEnabled: true,
    });
  });

  it('PUT /ai/preferences stores the patch for the caller and returns the re-read preferences', async () => {
    const { ctrl, pref, tiers } = make();
    pref.getUserPreferences.mockResolvedValueOnce({
      preferredModel: 'anthropic:claude-sonnet-5',
      preferredIntent: 'balanced',
      primaryProvider: null,
      ghostTextEnabled: true,
    });
    const res = await ctrl.updatePreferences(
      user,
      { preferredModel: 'anthropic:claude-sonnet-5' },
      req
    );
    expect(pref.setUserPreferences).toHaveBeenCalledWith(
      CALLER,
      { preferredModel: 'anthropic:claude-sonnet-5' },
      expect.any(Function)
    );
    expect(tiers.resolve).not.toHaveBeenCalled();
    expect(pref.getUserPreferences).toHaveBeenCalledWith(
      'u1',
      expect.any(Function)
    );
    expect(res).toEqual({
      preferredModel: 'anthropic:claude-sonnet-5',
      preferredIntent: 'balanced',
      primaryProvider: null,
      ghostTextEnabled: true,
    });
  });

  it('PUT /ai/preferences takes anonymity from the session', async () => {
    const { ctrl, pref } = make();
    await ctrl.updatePreferences(
      { id: 'a1', isAnonymous: true } as never,
      { preferredIntent: 'fast' },
      req
    );
    expect(pref.setUserPreferences).toHaveBeenCalledWith(
      { userId: 'a1', isAnonymous: true },
      { preferredIntent: 'fast' },
      expect.any(Function)
    );
  });

  it('PUT /ai/preferences forwards an intent-only patch without touching the model', async () => {
    const { ctrl, pref } = make();
    await ctrl.updatePreferences(user, { preferredIntent: 'fast' }, req);
    expect(pref.setUserPreferences).toHaveBeenCalledWith(
      CALLER,
      { preferredIntent: 'fast' },
      expect.any(Function)
    );
  });

  it('PUT /ai/preferences forwards a null model as a clear', async () => {
    const { ctrl, pref } = make();
    await ctrl.updatePreferences(user, { preferredModel: null }, req);
    expect(pref.setUserPreferences).toHaveBeenCalledWith(
      CALLER,
      { preferredModel: null },
      expect.any(Function)
    );
  });

  it('PUT /ai/preferences forwards a ghost text toggle', async () => {
    const { ctrl, pref } = make();
    await ctrl.updatePreferences(user, { ghostTextEnabled: false }, req);
    expect(pref.setUserPreferences).toHaveBeenCalledWith(
      CALLER,
      { ghostTextEnabled: false },
      expect.any(Function)
    );
  });

  it('GET /ai/preferences returns nulls when nothing is set', async () => {
    const { ctrl, pref } = make();
    pref.getUserPreferences.mockResolvedValueOnce({
      preferredModel: null,
      preferredIntent: null,
      primaryProvider: null,
      ghostTextEnabled: true,
    });
    expect(await ctrl.getPreferences(user, req)).toEqual({
      preferredModel: null,
      preferredIntent: null,
      primaryProvider: null,
      ghostTextEnabled: true,
    });
  });

  it('PUT /ai/preferences propagates a rejected model', async () => {
    const { ctrl, pref } = make();
    pref.setUserPreferences.mockRejectedValueOnce(
      new Error('This model is not available to you.')
    );
    await expect(
      ctrl.updatePreferences(user, { preferredModel: 'bogus' }, req)
    ).rejects.toThrow('This model is not available to you.');
  });

  it('GET /ai/models propagates a service failure', async () => {
    const { ctrl, pref } = make();
    pref.listModels.mockRejectedValueOnce(new Error('catalog unavailable'));
    await expect(ctrl.listModels(user, req)).rejects.toThrow(
      'catalog unavailable'
    );
  });

  it('GET /ai/models propagates a failed tier lookup', async () => {
    const { ctrl, pref, tiers } = make();
    tiers.resolve.mockRejectedValueOnce(new Error('tier unavailable'));
    await expect(ctrl.listModels(user, req)).rejects.toThrow(
      'tier unavailable'
    );
    expect(pref.listModels).not.toHaveBeenCalled();
  });

  describe('PUT /ai/preferences resolves the tier only for a model', () => {
    it('stores a patch naming no model while the key store is down', async () => {
      const { ctrl, repo, tiers } = makeWired();
      tiers.resolve.mockRejectedValue(
        new AiUnavailableError('tier', 'key store down')
      );

      await ctrl.updatePreferences(user, { ghostTextEnabled: false }, req);
      await ctrl.updatePreferences(user, { preferredIntent: 'fast' }, req);
      await ctrl.updatePreferences(user, { preferredModel: null }, req);
      await ctrl.updatePreferences(user, { primaryProvider: null }, req);

      expect(tiers.resolve).not.toHaveBeenCalled();
      expect(repo.patchSettings.mock.calls).toEqual([
        ['u1', { ghostTextEnabled: false }],
        ['u1', { preferredIntent: 'fast' }],
        ['u1', { preferredModel: null }],
        ['u1', { primaryProvider: null }],
      ]);
    });

    it("validates a model against the caller's resolved tier", async () => {
      const { ctrl, repo, tiers } = makeWired();

      await expect(
        ctrl.updatePreferences(
          user,
          { preferredModel: 'anthropic:claude-opus-5' },
          req
        )
      ).rejects.toBeInstanceOf(ModelUnavailableException);
      await ctrl.updatePreferences(
        user,
        { preferredModel: 'openrouter:minimax/minimax-m2.5' },
        req
      );

      expect(tiers.resolve).toHaveBeenCalledWith({
        userId: 'u1',
        isAnonymous: false,
        clientIp: '203.0.113.7',
      });
      expect(repo.patchSettings.mock.calls).toEqual([
        ['u1', { preferredModel: null, preferredIntent: 'fast' }],
      ]);
    });

    it("refuses a primary provider outside the caller's keys with 400", async () => {
      const { ctrl, repo, tiers } = makeWired();

      await expect(
        ctrl.updatePreferences(user, { primaryProvider: 'openrouter' }, req)
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tiers.resolve).toHaveBeenCalledTimes(1);
      expect(repo.patchSettings).not.toHaveBeenCalled();
    });

    it('surfaces a key-store outage on a model write', async () => {
      const { ctrl, repo, tiers } = makeWired();
      tiers.resolve.mockRejectedValue(
        new AiUnavailableError('tier', 'key store down')
      );

      await expect(
        ctrl.updatePreferences(
          user,
          { preferredModel: 'openrouter:minimax/minimax-m2.5' },
          req
        )
      ).rejects.toBeInstanceOf(AiUnavailableError);
      expect(repo.patchSettings).not.toHaveBeenCalled();
    });

    it('resolves the tier once when the re-read needs it too', async () => {
      const { ctrl, tiers } = makeWired({
        preferredModel: 'openrouter:minimax/minimax-m2.5',
        preferredIntent: 'powerful',
      });

      const res = await ctrl.updatePreferences(
        user,
        { preferredModel: 'openrouter:deepseek/deepseek-v3.2' },
        req
      );

      expect(tiers.resolve).toHaveBeenCalledTimes(1);
      expect(res).toEqual({
        preferredModel: null,
        preferredIntent: 'fast',
        primaryProvider: null,
        ghostTextEnabled: true,
      });
    });

    it('refuses an anonymous session without resolving its tier', async () => {
      const { ctrl, repo, tiers } = makeWired();

      await expect(
        ctrl.updatePreferences(
          { id: 'a1', isAnonymous: true } as never,
          { preferredModel: 'openrouter:deepseek/deepseek-v3.2' },
          req
        )
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tiers.resolve).not.toHaveBeenCalled();
      expect(repo.patchSettings).not.toHaveBeenCalled();
    });
  });

  it('GET /ai/preferences answers a stored platform model as the intent it serves', async () => {
    const { ctrl, tiers } = makeWired({
      preferredModel: 'openrouter:minimax/minimax-m2.5',
      preferredIntent: 'powerful',
    });

    expect(await ctrl.getPreferences(user, req)).toEqual({
      preferredModel: null,
      preferredIntent: 'fast',
      primaryProvider: null,
      ghostTextEnabled: true,
    });
    expect(tiers.resolve).toHaveBeenCalledWith({
      userId: 'u1',
      isAnonymous: false,
      clientIp: '203.0.113.7',
    });
  });
});
