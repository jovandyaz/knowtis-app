import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ModelPreferenceService } from './model-preference.service';

const SYSTEM_DEFAULT = 'anthropic:claude-sonnet-4-20250514';

function make(
  pref: string | null,
  selectable: string[],
  byokProviders: string[] = []
) {
  const repo = {
    getPreferredModel: vi.fn().mockResolvedValue(pref),
    setPreferredModel: vi.fn().mockResolvedValue(undefined),
  };
  const selectableSvc = {
    isSelectable: (id: string, providers?: ReadonlySet<string>) =>
      selectable.includes(id) || Boolean(providers?.has(id.split(':')[0])),
    list: (_systemDefault: string, providers?: ReadonlySet<string>) => {
      const unlocked = providers
        ? byokProviders
            .filter((p) => providers.has(p))
            .map((p) => `${p}:byok-model`)
        : [];
      return [...selectable, ...unlocked].map((id) => ({ id }));
    },
  };
  const aiConfig = {
    getDefaultModel: vi.fn().mockResolvedValue(SYSTEM_DEFAULT),
  };
  const byok = {
    enabledProviders: vi.fn().mockResolvedValue(new Set(byokProviders)),
  };
  const svc = new ModelPreferenceService(
    repo as never,
    selectableSvc as never,
    aiConfig as never,
    byok as never
  );
  return { svc, repo, byok };
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

  it('listModels includes a BYOK-unlocked provider model', async () => {
    const { svc, byok } = make(null, [SYSTEM_DEFAULT], ['google']);
    const ids = (await svc.listModels('u1')).map((m) => m.id);
    expect(ids.some((id) => id.startsWith('google:'))).toBe(true);
    expect(byok.enabledProviders).toHaveBeenCalledWith('u1');
  });

  it('effective default accepts a stored model unlocked by a BYOK key', async () => {
    const { svc } = make(
      'google:gemini-3.5-flash',
      [SYSTEM_DEFAULT],
      ['google']
    );
    expect(await svc.getEffectiveDefault('u1')).toBe('google:gemini-3.5-flash');
  });

  it('setUserPreference accepts a model unlocked by a BYOK key', async () => {
    const { svc, repo } = make(null, [SYSTEM_DEFAULT], ['google']);
    await svc.setUserPreference('u1', 'google:gemini-3.5-flash');
    expect(repo.setPreferredModel).toHaveBeenCalledWith(
      'u1',
      'google:gemini-3.5-flash'
    );
  });
});
