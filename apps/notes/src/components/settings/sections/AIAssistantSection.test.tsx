import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIAssistantSection } from './AIAssistantSection';

const update = vi.fn();
const openSettings = vi.fn();
const modelsData = vi.fn();
const useFeatureFlag = vi.fn().mockReturnValue(false);
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlag: () => useFeatureFlag(),
}));
vi.mock('./AIKeysManager', () => ({
  AIKeysManager: () => <div>byok-keys-manager</div>,
}));
vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: (select: (s: unknown) => unknown) =>
    select({ open: openSettings }),
}));
vi.mock('@/hooks', () => ({
  useAvailableModels: () => ({ data: modelsData() }),
  useAISettings: () => ({ data: { preferredModel: 'a:bal' } }),
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

const withLockedModel = [
  ...grantedModels,
  {
    id: 'x:premium',
    label: 'Premium One',
    descriptionKey: 'aiModels.gpt56',
    tier: 'powerful',
    contextWindow: 200000,
    costClass: 3,
    isDefault: false,
    billedToUser: false,
    access: 'requires_byok',
  },
];

describe('AIAssistantSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFeatureFlag.mockReturnValue(false);
    modelsData.mockReturnValue(grantedModels);
  });

  it('updates the default model on select', async () => {
    render(<AIAssistantSection />);
    await userEvent.click(screen.getByRole('button', { name: /Balanced One/ }));
    await userEvent.click(screen.getByText('Fast One'));
    expect(update).toHaveBeenCalledWith({ preferredModel: 'a:fast' });
  });

  it('renders a BYOK-gated model as disabled with the locked badge', async () => {
    modelsData.mockReturnValue(withLockedModel);
    render(<AIAssistantSection />);
    await userEvent.click(screen.getByRole('button', { name: /Balanced One/ }));

    const locked = screen.getByRole('menuitem', { name: /Premium One/ });
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText('aiAssistant.byok.lockedBadge')
    ).toBeInTheDocument();
  });

  it('offers a BYOK unlock CTA that opens AI settings when a model is locked', async () => {
    useFeatureFlag.mockReturnValue(true);
    modelsData.mockReturnValue(withLockedModel);
    render(<AIAssistantSection />);
    await userEvent.click(screen.getByRole('button', { name: /Balanced One/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'aiAssistant.byok.unlockCta' })
    );
    expect(openSettings).toHaveBeenCalledWith('aiAssistant');
  });

  it('hides the unlock CTA when no model is locked', async () => {
    useFeatureFlag.mockReturnValue(true);
    render(<AIAssistantSection />);
    await userEvent.click(screen.getByRole('button', { name: /Balanced One/ }));
    expect(
      screen.queryByText('aiAssistant.byok.unlockCta')
    ).not.toBeInTheDocument();
  });

  it('hides the unlock CTA when key management is unavailable, keeping the locked badge', async () => {
    useFeatureFlag.mockReturnValue(false);
    modelsData.mockReturnValue(withLockedModel);
    render(<AIAssistantSection />);
    await userEvent.click(screen.getByRole('button', { name: /Balanced One/ }));
    expect(
      screen.getByText('aiAssistant.byok.lockedBadge')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('aiAssistant.byok.unlockCta')
    ).not.toBeInTheDocument();
  });

  it('does not render the BYOK keys manager when the flag is off', () => {
    render(<AIAssistantSection />);
    expect(screen.queryByText('byok-keys-manager')).not.toBeInTheDocument();
  });

  it('renders the BYOK keys manager when the flag is enabled', () => {
    useFeatureFlag.mockReturnValue(true);
    render(<AIAssistantSection />);
    expect(screen.getByText('byok-keys-manager')).toBeInTheDocument();
  });
});
