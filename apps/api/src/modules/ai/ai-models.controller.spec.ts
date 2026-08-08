import { describe, expect, it, vi } from 'vitest';

import { AiModelsController } from './ai-models.controller';
import type { ModelPreferenceService } from './application/services/model-preference.service';

const user = { id: 'u1' } as never;

function make() {
  const pref = {
    listModels: vi
      .fn()
      .mockResolvedValue([{ id: 'anthropic:claude-sonnet-4-20250514' }]),
    getUserPreferences: vi.fn().mockResolvedValue({
      preferredModel: 'openai:gpt-4o-mini',
      preferredIntent: 'balanced',
    }),
    setUserPreferences: vi.fn().mockResolvedValue(undefined),
  } satisfies Partial<Record<keyof ModelPreferenceService, unknown>>;
  return { ctrl: new AiModelsController(pref as never), pref };
}

describe('AiModelsController', () => {
  it('GET /ai/models returns the per-user catalog', async () => {
    const { ctrl, pref } = make();
    const list = await ctrl.listModels(user);
    expect(list).toHaveLength(1);
    expect(pref.listModels).toHaveBeenCalledWith('u1');
  });

  it('GET /ai/preferences returns both stored preferences', async () => {
    const { ctrl } = make();
    expect(await ctrl.getPreferences(user)).toEqual({
      preferredModel: 'openai:gpt-4o-mini',
      preferredIntent: 'balanced',
    });
  });

  it('PUT /ai/preferences persists the patch and returns the re-read preferences', async () => {
    const { ctrl, pref } = make();
    pref.getUserPreferences.mockResolvedValueOnce({
      preferredModel: 'anthropic:claude-sonnet-5',
      preferredIntent: 'balanced',
    });
    const res = await ctrl.updatePreferences(user, {
      preferredModel: 'anthropic:claude-sonnet-5',
    });
    expect(pref.setUserPreferences).toHaveBeenCalledWith('u1', {
      preferredModel: 'anthropic:claude-sonnet-5',
    });
    expect(res).toEqual({
      preferredModel: 'anthropic:claude-sonnet-5',
      preferredIntent: 'balanced',
    });
  });

  it('PUT /ai/preferences forwards an intent-only patch without touching the model', async () => {
    const { ctrl, pref } = make();
    await ctrl.updatePreferences(user, { preferredIntent: 'fast' });
    expect(pref.setUserPreferences).toHaveBeenCalledWith('u1', {
      preferredIntent: 'fast',
    });
  });

  it('PUT /ai/preferences forwards a null model as a clear', async () => {
    const { ctrl, pref } = make();
    await ctrl.updatePreferences(user, { preferredModel: null });
    expect(pref.setUserPreferences).toHaveBeenCalledWith('u1', {
      preferredModel: null,
    });
  });

  it('GET /ai/preferences returns nulls when nothing is set', async () => {
    const { ctrl, pref } = make();
    pref.getUserPreferences.mockResolvedValueOnce({
      preferredModel: null,
      preferredIntent: null,
    });
    expect(await ctrl.getPreferences(user)).toEqual({
      preferredModel: null,
      preferredIntent: null,
    });
  });

  it('PUT /ai/preferences propagates a rejected invalid model', async () => {
    const { ctrl, pref } = make();
    pref.setUserPreferences.mockRejectedValueOnce(
      new Error('Model not selectable: bogus')
    );
    await expect(
      ctrl.updatePreferences(user, { preferredModel: 'bogus' })
    ).rejects.toThrow('Model not selectable');
  });

  it('GET /ai/models propagates a service failure', async () => {
    const { ctrl, pref } = make();
    pref.listModels.mockRejectedValueOnce(new Error('catalog unavailable'));
    await expect(ctrl.listModels(user)).rejects.toThrow('catalog unavailable');
  });
});
