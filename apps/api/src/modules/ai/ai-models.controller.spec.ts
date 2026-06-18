import { describe, expect, it, vi } from 'vitest';

import { AiModelsController } from './ai-models.controller';

const user = { id: 'u1' } as never;

function make() {
  const pref = {
    listModels: vi
      .fn()
      .mockResolvedValue([{ id: 'anthropic:claude-sonnet-4-20250514' }]),
    getUserPreference: vi.fn().mockResolvedValue('openai:gpt-4o-mini'),
    setUserPreference: vi.fn().mockResolvedValue(undefined),
  };
  return { ctrl: new AiModelsController(pref as never), pref };
}

describe('AiModelsController', () => {
  it('GET /ai/models returns the catalog', async () => {
    const { ctrl } = make();
    const list = await ctrl.listModels();
    expect(list).toHaveLength(1);
  });

  it('GET /ai/preferences returns the stored preference', async () => {
    const { ctrl } = make();
    expect(await ctrl.getPreferences(user)).toEqual({
      preferredModel: 'openai:gpt-4o-mini',
    });
  });

  it('PUT /ai/preferences persists and echoes the value', async () => {
    const { ctrl, pref } = make();
    const res = await ctrl.updatePreferences(user, {
      preferredModel: 'anthropic:claude-sonnet-4-20250514',
    });
    expect(pref.setUserPreference).toHaveBeenCalledWith(
      'u1',
      'anthropic:claude-sonnet-4-20250514'
    );
    expect(res).toEqual({
      preferredModel: 'anthropic:claude-sonnet-4-20250514',
    });
  });
});
