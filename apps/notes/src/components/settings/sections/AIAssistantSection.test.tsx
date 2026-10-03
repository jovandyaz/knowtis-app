import { useSettingsStore } from '@/stores/settings.store';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ModelCatalogResponse,
  SelectableModel,
} from '@knowtis/shared-types';

import { AIAssistantSection } from './AIAssistantSection';

function catalogOf(
  models: SelectableModel[] | undefined
): ModelCatalogResponse | undefined {
  return models && { tier: 'free', models, intents: [] };
}

const update = vi.fn();
const modelsData = vi.fn();
const modelsError = vi.fn<() => boolean>();
const modelsRefetch = vi.fn();
const prefsData = vi.fn();
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
vi.mock('./AIKeysManager', () => ({
  AIKeysManager: ({ focusFirstField }: { focusFirstField?: boolean }) => (
    <div>
      {focusFirstField ? 'byok-keys-manager-focused' : 'byok-keys-manager'}
    </div>
  ),
}));
vi.mock('./PrimaryProviderPicker', () => ({
  PrimaryProviderPicker: () => <div>primary-provider-picker</div>,
}));
vi.mock('@/hooks/useAvailableModels', () => ({
  useAvailableModels: () => ({
    data: catalogOf(modelsData()),
    isPending: false,
    isError: modelsError(),
    refetch: modelsRefetch,
  }),
}));
vi.mock('@/hooks/useAISettings', () => ({
  useAISettings: () => ({ data: prefsData() }),
  useUpdateAISettings: () => ({ mutate: update }),
}));

const intentServingModels = [
  {
    id: 'a:bal',
    label: 'Balanced One',
    descriptionKey: 'aiModels.sonnet4',
    tier: 'balanced',
    contextWindow: 1000000,
    costClass: 2,
    isDefault: true,
    billedToUser: false,
    servesIntent: 'balanced',
  },
  {
    id: 'a:fast',
    label: 'Fast One',
    descriptionKey: 'aiModels.haiku45',
    tier: 'fast',
    contextWindow: 200000,
    costClass: 1,
    isDefault: false,
    billedToUser: false,
    servesIntent: 'fast',
  },
];

const powerfulModel = {
  id: 'x:premium',
  label: 'Premium One',
  descriptionKey: 'aiModels.gpt56Sol',
  tier: 'powerful',
  contextWindow: 200000,
  costClass: 3,
  isDefault: false,
  billedToUser: false,
  servesIntent: 'powerful',
};

const byokModel = {
  id: 'o:byok',
  label: 'Byok One',
  descriptionKey: 'aiModels.gpt56Sol',
  tier: 'powerful',
  contextWindow: 200000,
  costClass: 3,
  isDefault: false,
  billedToUser: true,
};

const withPowerfulModel = [...intentServingModels, powerfulModel];
const withByokModel = [...intentServingModels, powerfulModel, byokModel];

describe('AIAssistantSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({ focusTarget: null });
    modelsData.mockReturnValue(intentServingModels);
    modelsError.mockReturnValue(false);
    prefsData.mockReturnValue({
      preferredModel: null,
      preferredIntent: null,
      primaryProvider: null,
      ghostTextEnabled: true,
    });
  });

  it('offers only the three intent chips to a user without BYOK models', () => {
    modelsData.mockReturnValue(withPowerfulModel);
    render(<AIAssistantSection />);

    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(
      screen.getByRole('radio', { name: 'aiAssistant.intent.fast' })
    ).toHaveAttribute(
      'title',
      'aiAssistant.intent.rowDetail(model=Fast One,hint=aiAssistant.intent.fastHint)'
    );
    expect(
      screen.getByRole('radio', { name: 'aiAssistant.intent.balanced' })
    ).toHaveAttribute(
      'title',
      'aiAssistant.intent.rowDetail(model=Balanced One,hint=aiAssistant.intent.balancedHint)'
    );
    expect(
      screen.getByRole('radio', { name: 'aiAssistant.intent.powerful' })
    ).toHaveAttribute(
      'title',
      'aiAssistant.intent.rowDetail(model=Premium One,hint=aiAssistant.intent.powerfulHint)'
    );
    expect(
      screen.queryByRole('button', { name: /aiAssistant.advanced.trigger/ })
    ).not.toBeInTheDocument();
  });

  it('keeps the keys manager reachable so a free user can add a BYOK key', () => {
    modelsData.mockReturnValue(withPowerfulModel);
    render(<AIAssistantSection />);

    expect(screen.getByText('byok-keys-manager')).toBeInTheDocument();
  });

  it('lands on the key form when the section was opened to add a key', () => {
    useSettingsStore.setState({ focusTarget: 'aiKeys' });
    render(<AIAssistantSection />);

    expect(screen.getByText('byok-keys-manager-focused')).toBeInTheDocument();
  });

  it('activates the default intent when the account has none stored', () => {
    render(<AIAssistantSection />);

    expect(
      screen.getByRole('radio', { name: 'aiAssistant.intent.balanced' })
    ).toHaveAttribute('data-state', 'on');
  });

  it('deactivates every chip while an advanced account override is in effect', () => {
    modelsData.mockReturnValue(withByokModel);
    prefsData.mockReturnValue({
      preferredModel: 'o:byok',
      preferredIntent: 'fast',
    });
    render(<AIAssistantSection />);

    for (const chip of screen.getAllByRole('radio')) {
      expect(chip).toHaveAttribute('data-state', 'off');
    }
  });

  it('names the stored model override on the advanced trigger', () => {
    modelsData.mockReturnValue(withByokModel);
    prefsData.mockReturnValue({
      preferredModel: 'o:byok',
      preferredIntent: null,
    });
    render(<AIAssistantSection />);

    expect(
      screen.getByRole('button', { name: /Byok One/ })
    ).toBeInTheDocument();
  });

  it('keeps the intent chips active over a legacy non-advanced preferredModel', () => {
    modelsData.mockReturnValue(withByokModel);
    prefsData.mockReturnValue({
      preferredModel: 'a:fast',
      preferredIntent: 'fast',
    });
    render(<AIAssistantSection />);

    expect(
      screen.getByRole('radio', { name: 'aiAssistant.intent.fast' })
    ).toHaveAttribute('data-state', 'on');
  });

  it('renders no chips while the model list is unresolved', () => {
    modelsData.mockReturnValue(undefined);
    modelsError.mockReturnValue(true);
    prefsData.mockReturnValue({
      preferredModel: 'o:byok',
      preferredIntent: 'fast',
    });
    render(<AIAssistantSection />);

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('surfaces a model-list load error behind the advanced trigger', async () => {
    modelsData.mockReturnValue(undefined);
    modelsError.mockReturnValue(true);
    render(<AIAssistantSection />);

    await userEvent.click(
      screen.getByRole('button', { name: 'aiAssistant.loadError' })
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'aiAssistant.retry' })
    );

    expect(modelsRefetch).toHaveBeenCalled();
  });

  it('drops any model override when an intent chip is picked', async () => {
    modelsData.mockReturnValue(withPowerfulModel);
    prefsData.mockReturnValue({
      preferredModel: 'a:fast',
      preferredIntent: null,
    });
    render(<AIAssistantSection />);

    await userEvent.click(
      screen.getByRole('radio', { name: 'aiAssistant.intent.powerful' })
    );

    expect(update).toHaveBeenCalledWith({
      preferredModel: null,
      preferredIntent: 'powerful',
    });
  });

  it('offers the advanced picker with only BYOK-billed models', async () => {
    modelsData.mockReturnValue(withByokModel);
    render(<AIAssistantSection />);

    await userEvent.click(
      screen.getByRole('button', { name: /aiAssistant.advanced.trigger/ })
    );

    expect(
      screen.getByRole('menuitemradio', { name: /Byok One/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitemradio', { name: /Balanced One/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitemradio', { name: /Premium One/ })
    ).not.toBeInTheDocument();
  });

  it('stores an advanced model as the account override', async () => {
    modelsData.mockReturnValue(withByokModel);
    render(<AIAssistantSection />);

    await userEvent.click(
      screen.getByRole('button', { name: /aiAssistant.advanced.trigger/ })
    );
    await userEvent.click(screen.getByText('Byok One'));

    expect(update).toHaveBeenCalledWith({ preferredModel: 'o:byok' });
  });

  it('shows a key model picked in Advanced as selected even when it serves an intent', async () => {
    const keyServingIntent = { ...intentServingModels[0], billedToUser: true };
    modelsData.mockReturnValue([keyServingIntent, intentServingModels[1]]);
    const { rerender } = render(<AIAssistantSection />);

    await userEvent.click(
      screen.getByRole('button', { name: /aiAssistant.advanced.trigger/ })
    );
    await userEvent.click(
      screen.getByRole('menuitemradio', { name: /Balanced One/ })
    );
    expect(update).toHaveBeenCalledWith({ preferredModel: 'a:bal' });

    prefsData.mockReturnValue({
      preferredModel: 'a:bal',
      preferredIntent: 'fast',
      primaryProvider: null,
      ghostTextEnabled: true,
    });
    rerender(<AIAssistantSection />);

    expect(
      screen.getByRole('button', { name: /Balanced One/ })
    ).toBeInTheDocument();
    for (const chip of screen.getAllByRole('radio')) {
      expect(chip).toHaveAttribute('data-state', 'off');
    }
  });

  it('shows autocomplete as on while the account preference is on', () => {
    render(<AIAssistantSection />);

    expect(
      screen.getByRole('switch', { name: 'aiAssistant.autocompleteLabel' })
    ).toBeChecked();
  });

  it('reflects an account that turned autocomplete off', () => {
    prefsData.mockReturnValue({
      preferredModel: null,
      preferredIntent: null,
      primaryProvider: null,
      ghostTextEnabled: false,
    });
    render(<AIAssistantSection />);

    expect(
      screen.getByRole('switch', { name: 'aiAssistant.autocompleteLabel' })
    ).not.toBeChecked();
  });

  it('stores the new autocomplete preference when the switch is flipped', async () => {
    render(<AIAssistantSection />);

    await userEvent.click(
      screen.getByRole('switch', { name: 'aiAssistant.autocompleteLabel' })
    );

    expect(update).toHaveBeenCalledWith({ ghostTextEnabled: false });
  });

  it('clears a stored model override when an intent chip is picked', async () => {
    modelsData.mockReturnValue(withByokModel);
    prefsData.mockReturnValue({
      preferredModel: 'o:byok',
      preferredIntent: 'fast',
    });
    render(<AIAssistantSection />);

    const chip = screen.getByRole('radio', { name: 'aiAssistant.intent.fast' });
    expect(chip).toBeEnabled();
    await userEvent.click(chip);

    expect(update).toHaveBeenCalledWith({
      preferredModel: null,
      preferredIntent: 'fast',
    });
  });

  it('offers the primary provider choice after the API keys', () => {
    render(<AIAssistantSection />);

    const keys = screen.getByText('byok-keys-manager');
    const primary = screen.getByText('primary-provider-picker');
    expect(
      keys.compareDocumentPosition(primary) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('names the provider of each Advanced model, so one model on two keys reads as two routes', async () => {
    const haiku = {
      id: 'anthropic:claude-haiku-4-5',
      label: 'Haiku 4.5',
      descriptionKey: 'aiModels.haiku45',
      tier: 'fast',
      contextWindow: 200000,
      costClass: 1,
      isDefault: false,
      billedToUser: true,
    };
    modelsData.mockReturnValue([
      ...intentServingModels,
      haiku,
      { ...haiku, id: 'openrouter:anthropic/claude-haiku-4.5' },
    ]);
    render(<AIAssistantSection />);

    await userEvent.click(
      screen.getByRole('button', { name: /aiAssistant.advanced.trigger/ })
    );

    expect(
      screen
        .getAllByRole('menuitemradio', { name: /Haiku 4\.5/ })
        .map((row) => row.textContent)
    ).toEqual([
      expect.stringContaining(
        'aiAssistant.advanced.routeDetail(provider=Anthropic,detail=aiModels.haiku45)'
      ),
      expect.stringContaining(
        'aiAssistant.advanced.routeDetail(provider=OpenRouter,detail=aiModels.haiku45)'
      ),
    ]);
  });
});
