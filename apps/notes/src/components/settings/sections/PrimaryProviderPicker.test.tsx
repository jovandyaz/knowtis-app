import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AIPreferences,
  ByokProvider,
  ProviderKeyInfo,
} from '@knowtis/shared-types';

import { PrimaryProviderPicker } from './PrimaryProviderPicker';

const keysData = vi.fn<() => ProviderKeyInfo[] | undefined>();
const prefsData = vi.fn<() => AIPreferences | undefined>();
const update = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts
        ? `${key}(${Object.entries(opts)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(',')})`
        : key,
  }),
}));
vi.mock('@/hooks/useProviderKeys', () => ({
  useProviderKeys: () => ({ data: keysData() }),
}));
vi.mock('@/hooks/useAISettings', () => ({
  useAISettings: () => ({ data: prefsData() }),
  useUpdateAISettings: () => ({ mutate: update }),
}));

function key(
  provider: ByokProvider,
  createdAt: string,
  keyPrefix: string
): ProviderKeyInfo {
  return { provider, keyPrefix, lastUsedAt: null, createdAt };
}

function preferences(primaryProvider: ByokProvider | null): AIPreferences {
  return {
    preferredModel: null,
    preferredIntent: null,
    primaryProvider,
    ghostTextEnabled: true,
  };
}

const ANTHROPIC = key('anthropic', '2026-01-01T00:00:00.000Z', 'sk-ant-a');
const OPENROUTER = key('openrouter', '2026-02-01T00:00:00.000Z', 'sk-or-v1');

describe('PrimaryProviderPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    keysData.mockReturnValue([OPENROUTER, ANTHROPIC]);
    prefsData.mockReturnValue(preferences(null));
  });

  it.each([[[]], [[ANTHROPIC]], [undefined]])(
    'offers no choice with fewer than two keys (%j)',
    (keys) => {
      keysData.mockReturnValue(keys);

      const { container } = render(<PrimaryProviderPicker />);

      expect(container).toBeEmptyDOMElement();
    }
  );

  it('lists the held providers in the order their keys were added, the first one checked by default', () => {
    render(<PrimaryProviderPicker />);

    const group = screen.getByRole('radiogroup', {
      name: 'aiAssistant.primaryProvider.title',
    });
    expect(group).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.textContent)).toEqual([
      expect.stringContaining('Anthropic'),
      expect.stringContaining('OpenRouter'),
    ]);
    expect(radios[0]).toHaveTextContent(
      'aiAssistant.byok.stored(prefix=sk-ant-a)'
    );
    expect(screen.getByRole('radio', { name: /^Anthropic/ })).toBeChecked();
  });

  it('checks the stored primary while its key is held', () => {
    prefsData.mockReturnValue(preferences('openrouter'));

    render(<PrimaryProviderPicker />);

    expect(screen.getByRole('radio', { name: /^OpenRouter/ })).toBeChecked();
  });

  it('checks the first key added when the stored primary’s key is gone, and writes nothing', () => {
    prefsData.mockReturnValue(preferences('openai'));

    render(<PrimaryProviderPicker />);

    expect(screen.getByRole('radio', { name: /^Anthropic/ })).toBeChecked();
    expect(update).not.toHaveBeenCalled();
  });

  it('stores the provider the user picks', async () => {
    render(<PrimaryProviderPicker />);

    await userEvent.click(screen.getByRole('radio', { name: /^OpenRouter/ }));

    expect(update).toHaveBeenCalledWith({ primaryProvider: 'openrouter' });
  });
});
