import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ModelPreferenceService } from './model-preference.service';

const SYSTEM_DEFAULT = 'anthropic:claude-sonnet-4-20250514';

function make(pref: string | null, selectable: string[]) {
  const repo = {
    getPreferredModel: vi.fn().mockResolvedValue(pref),
    setPreferredModel: vi.fn().mockResolvedValue(undefined),
  };
  const selectableSvc = {
    isSelectable: (id: string) => selectable.includes(id),
    list: () => selectable.map((id) => ({ id })),
  };
  const aiConfig = {
    getDefaultModel: vi.fn().mockResolvedValue(SYSTEM_DEFAULT),
  };
  const svc = new ModelPreferenceService(
    repo as never,
    selectableSvc as never,
    aiConfig as never
  );
  return { svc, repo };
}

describe('ModelPreferenceService', () => {
  it('effective default = a valid user preference', async () => {
    const { svc } = make('openai:gpt-4o-mini', [
      SYSTEM_DEFAULT,
      'openai:gpt-4o-mini',
    ]);
    expect(await svc.getEffectiveDefault('u1')).toBe('openai:gpt-4o-mini');
  });

  it('effective default = system default when no preference', async () => {
    const { svc } = make(null, [SYSTEM_DEFAULT]);
    expect(await svc.getEffectiveDefault('u1')).toBe(SYSTEM_DEFAULT);
  });

  it('effective default falls back to system when stored model is no longer selectable', async () => {
    const { svc } = make('openai:retired-model', [SYSTEM_DEFAULT]);
    expect(await svc.getEffectiveDefault('u1')).toBe(SYSTEM_DEFAULT);
  });

  it('setUserPreference rejects an unselectable model', async () => {
    const { svc, repo } = make(null, [SYSTEM_DEFAULT]);
    await expect(svc.setUserPreference('u1', 'openai:nope')).rejects.toThrow(
      BadRequestException
    );
    expect(repo.setPreferredModel).not.toHaveBeenCalled();
  });

  it('setUserPreference(null) clears without validation', async () => {
    const { svc, repo } = make('x', [SYSTEM_DEFAULT]);
    await svc.setUserPreference('u1', null);
    expect(repo.setPreferredModel).toHaveBeenCalledWith('u1', null);
  });
});
