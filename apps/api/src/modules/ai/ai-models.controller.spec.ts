import { describe, expect, it, vi } from 'vitest';

import { AiModelsController } from './ai-models.controller';
import type { ModelPreferenceService } from './application/services/model-preference.service';
import type { TierResolver } from './application/services/tier-resolver.service';
import { createExecutionContext } from './testing/create-execution-context';

const user = { id: 'u1' } as never;
const req = { ip: '203.0.113.7', headers: {} } as never;
const FREE_EXECUTION = createExecutionContext({ tier: 'free' });

function make() {
  const pref = {
    listModels: vi.fn().mockResolvedValue({
      tier: 'free',
      models: [{ id: 'openrouter:deepseek/deepseek-v3.2' }],
      intents: [],
    }),
    getUserPreferences: vi.fn().mockResolvedValue({
      preferredModel: 'openai:gpt-4o-mini',
      preferredIntent: 'balanced',
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

describe('AiModelsController', () => {
  it('GET /ai/models answers the envelope for the resolved tier', async () => {
    const { ctrl, pref, tiers } = make();
    await ctrl.listModels(user, req);
    expect(tiers.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', isAnonymous: false })
    );
    expect(pref.listModels).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'free' })
    );
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
    expect(await ctrl.getPreferences(user)).toEqual({
      preferredModel: 'openai:gpt-4o-mini',
      preferredIntent: 'balanced',
      ghostTextEnabled: true,
    });
  });

  it('PUT /ai/preferences validates the patch against the resolved execution and returns the re-read preferences', async () => {
    const { ctrl, pref, tiers } = make();
    pref.getUserPreferences.mockResolvedValueOnce({
      preferredModel: 'anthropic:claude-sonnet-5',
      preferredIntent: 'balanced',
      ghostTextEnabled: true,
    });
    const res = await ctrl.updatePreferences(
      user,
      { preferredModel: 'anthropic:claude-sonnet-5' },
      req
    );
    expect(tiers.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', isAnonymous: false })
    );
    expect(pref.setUserPreferences).toHaveBeenCalledWith(FREE_EXECUTION, {
      preferredModel: 'anthropic:claude-sonnet-5',
    });
    expect(pref.getUserPreferences).toHaveBeenCalledWith('u1');
    expect(res).toEqual({
      preferredModel: 'anthropic:claude-sonnet-5',
      preferredIntent: 'balanced',
      ghostTextEnabled: true,
    });
  });

  it('PUT /ai/preferences forwards an intent-only patch without touching the model', async () => {
    const { ctrl, pref } = make();
    await ctrl.updatePreferences(user, { preferredIntent: 'fast' }, req);
    expect(pref.setUserPreferences).toHaveBeenCalledWith(FREE_EXECUTION, {
      preferredIntent: 'fast',
    });
  });

  it('PUT /ai/preferences forwards a null model as a clear', async () => {
    const { ctrl, pref } = make();
    await ctrl.updatePreferences(user, { preferredModel: null }, req);
    expect(pref.setUserPreferences).toHaveBeenCalledWith(FREE_EXECUTION, {
      preferredModel: null,
    });
  });

  it('PUT /ai/preferences forwards a ghost text toggle', async () => {
    const { ctrl, pref } = make();
    await ctrl.updatePreferences(user, { ghostTextEnabled: false }, req);
    expect(pref.setUserPreferences).toHaveBeenCalledWith(FREE_EXECUTION, {
      ghostTextEnabled: false,
    });
  });

  it('GET /ai/preferences returns nulls when nothing is set', async () => {
    const { ctrl, pref } = make();
    pref.getUserPreferences.mockResolvedValueOnce({
      preferredModel: null,
      preferredIntent: null,
      ghostTextEnabled: true,
    });
    expect(await ctrl.getPreferences(user)).toEqual({
      preferredModel: null,
      preferredIntent: null,
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
});
