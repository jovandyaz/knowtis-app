import { useSettingsStore } from '@/stores/settings.store';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { AIAssistantSection } from './AIAssistantSection';

const update = vi.fn();
const modelsData = vi.fn();
const modelsError = vi.fn<() => boolean>();
const modelsRefetch = vi.fn();
const prefsData = vi.fn();
const featureFlag = vi.fn<(key: string) => boolean>();
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlag: (key: string) => featureFlag(key),
}));
vi.mock('./AIKeysManager', () => ({
  AIKeysManager: ({ focusFirstField }: { focusFirstField?: boolean }) => (
    <div>
      {focusFirstField ? 'byok-keys-manager-focused' : 'byok-keys-manager'}
    </div>
  ),
}));
vi.mock('@/hooks', () => ({
  useAvailableModels: () => ({
    data: modelsData(),
    isPending: false,
    isError: modelsError(),
    refetch: modelsRefetch,
  }),
  useAISettings: () => ({ data: prefsData() }),
  useUpdateAISettings: () => ({ mutate: update }),
}));

const grantedModels = [
  {
    id: 'a:bal',
    label: 'Balanced One',
    descriptionKey: 'aiModels.sonnet4',
    tier: 'balanced',
    contextWindow: 1000000,
    costClass: 2,
    isDefault: true,
    billedToUser: false,
    access: 'granted',
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
    access: 'granted',
    servesIntent: 'fast',
  },
];

const lockedModel = {
  id: 'x:premium',
  label: 'Premium One',
  descriptionKey: 'aiModels.gpt56Sol',
  tier: 'powerful',
  contextWindow: 200000,
  costClass: 3,
  isDefault: false,
  billedToUser: false,
  access: 'requires_byok',
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
  access: 'granted',
};

const withLockedModel = [...grantedModels, lockedModel];
const withByokModel = [...grantedModels, lockedModel, byokModel];

function enableFlags(...keys: string[]) {
  featureFlag.mockImplementation((key) => keys.includes(key));
}

describe('AIAssistantSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({ focusTarget: null });
    enableFlags(FEATURE_FLAG_KEYS.AGENT_BYOK);
    modelsData.mockReturnValue(grantedModels);
    modelsError.mockReturnValue(false);
    prefsData.mockReturnValue({
      preferredModel: null,
      preferredIntent: null,
    });
  });

  it('offers only the three intent chips to a user without BYOK models', () => {
    modelsData.mockReturnValue(withLockedModel);
    render(<AIAssistantSection />);

    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Fast One' })).toHaveAttribute(
      'title',
      'aiAssistant.intent.fastHint'
    );
    expect(
      screen.getByRole('radio', { name: 'Balanced One' })
    ).toHaveAttribute('title', 'aiAssistant.intent.balancedHint');
    expect(screen.getByRole('radio', { name: 'Premium One' })).toHaveAttribute(
      'title',
      'aiAssistant.intent.powerfulHint'
    );
    expect(
      screen.queryByRole('button', { name: /aiAssistant.advanced.trigger/ })
    ).not.toBeInTheDocument();
  });

  it('keeps the keys manager reachable so a free user can add a BYOK key', () => {
    modelsData.mockReturnValue(withLockedModel);
    render(<AIAssistantSection />);

    expect(screen.getByText('byok-keys-manager')).toBeInTheDocument();
  });

  it('lands on the key form when the section was opened to add a key', () => {
    useSettingsStore.setState({ focusTarget: 'aiKeys' });
    render(<AIAssistantSection />);

    expect(screen.getByText('byok-keys-manager-focused')).toBeInTheDocument();
  });

  it('renders the chips without the keys manager when key management is off', () => {
    enableFlags();
    modelsData.mockReturnValue(withByokModel);
    render(<AIAssistantSection />);

    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.queryByText('byok-keys-manager')).not.toBeInTheDocument();
  });

  it('activates the default intent when the account has none stored', () => {
    render(<AIAssistantSection />);

    expect(screen.getByRole('radio', { name: 'Balanced One' })).toHaveAttribute(
      'data-state',
      'on'
    );
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

    expect(screen.getByRole('radio', { name: 'Fast One' })).toHaveAttribute(
      'data-state',
      'on'
    );
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
    modelsData.mockReturnValue(withLockedModel);
    prefsData.mockReturnValue({
      preferredModel: 'a:fast',
      preferredIntent: null,
    });
    render(<AIAssistantSection />);

    await userEvent.click(screen.getByRole('radio', { name: 'Premium One' }));

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

  it('clears a stored model override when an intent chip is picked', async () => {
    modelsData.mockReturnValue(withByokModel);
    prefsData.mockReturnValue({
      preferredModel: 'o:byok',
      preferredIntent: 'fast',
    });
    render(<AIAssistantSection />);

    const chip = screen.getByRole('radio', { name: 'Fast One' });
    expect(chip).toBeEnabled();
    await userEvent.click(chip);

    expect(update).toHaveBeenCalledWith({
      preferredModel: null,
      preferredIntent: 'fast',
    });
  });
});
