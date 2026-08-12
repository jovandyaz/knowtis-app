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
const sessionModel = vi.fn<() => string | null>();
const setSessionModel = vi.fn();
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@/stores/agent.store', () => ({
  useAgentStore: (select: (s: unknown) => unknown) =>
    select({
      selectedModel: sessionModel(),
      setSelectedModel: setSessionModel,
    }),
}));
vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlag: (key: string) => featureFlag(key),
}));
vi.mock('./AIKeysManager', () => ({
  AIKeysManager: () => <div>byok-keys-manager</div>,
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
  },
];

const lockedModel = {
  id: 'x:premium',
  label: 'Premium One',
  descriptionKey: 'aiModels.gpt56',
  tier: 'powerful',
  contextWindow: 200000,
  costClass: 3,
  isDefault: false,
  billedToUser: false,
  access: 'requires_byok',
};

const byokModel = {
  id: 'o:byok',
  label: 'Byok One',
  descriptionKey: 'aiModels.gpt56',
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
    enableFlags(FEATURE_FLAG_KEYS.AGENT_BYOK);
    modelsData.mockReturnValue(grantedModels);
    modelsError.mockReturnValue(false);
    prefsData.mockReturnValue({
      preferredModel: null,
      preferredIntent: null,
    });
    sessionModel.mockReturnValue(null);
  });

  it('offers only the three intent chips to a user without BYOK models', () => {
    modelsData.mockReturnValue(withLockedModel);
    render(<AIAssistantSection />);

    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(
      screen.getByRole('radio', { name: 'aiAssistant.intent.fast' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: 'aiAssistant.intent.balanced' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: 'aiAssistant.intent.powerful' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /aiAssistant.advanced.trigger/ })
    ).not.toBeInTheDocument();
  });

  it('keeps the keys manager reachable so a free user can add a BYOK key', () => {
    modelsData.mockReturnValue(withLockedModel);
    render(<AIAssistantSection />);

    expect(screen.getByText('byok-keys-manager')).toBeInTheDocument();
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

  it('keeps the chips deselected for a stored preference while the list is unresolved', () => {
    modelsData.mockReturnValue(undefined);
    modelsError.mockReturnValue(true);
    prefsData.mockReturnValue({
      preferredModel: 'o:byok',
      preferredIntent: 'fast',
    });
    render(<AIAssistantSection />);

    for (const chip of screen.getAllByRole('radio')) {
      expect(chip).toHaveAttribute('data-state', 'off');
    }
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
      screen.getByRole('menuitem', { name: /Byok One/ })
    ).toBeInTheDocument();
    expect(screen.queryByText('Balanced One')).not.toBeInTheDocument();
    expect(screen.queryByText('Premium One')).not.toBeInTheDocument();
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

  it('clears the composer session override when an intent chip is picked', async () => {
    modelsData.mockReturnValue(withByokModel);
    sessionModel.mockReturnValue('o:byok');
    render(<AIAssistantSection />);

    await userEvent.click(
      screen.getByRole('radio', { name: 'aiAssistant.intent.powerful' })
    );

    expect(setSessionModel).toHaveBeenCalledWith(null);
  });

  it('clears the composer session override when an advanced model is stored', async () => {
    modelsData.mockReturnValue(withByokModel);
    sessionModel.mockReturnValue('a:fast');
    render(<AIAssistantSection />);

    await userEvent.click(
      screen.getByRole('button', { name: /aiAssistant.advanced.trigger/ })
    );
    await userEvent.click(screen.getByText('Byok One'));

    expect(update).toHaveBeenCalledWith({ preferredModel: 'o:byok' });
    expect(setSessionModel).toHaveBeenCalledWith(null);
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
});
