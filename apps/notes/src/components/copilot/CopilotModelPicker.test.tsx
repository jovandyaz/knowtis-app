import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CopilotModelPicker } from './CopilotModelPicker';

const setSelected = vi.fn();
const openSettings = vi.fn();
const modelsData = vi.fn();
const byokFlag = vi.fn();

vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlag: () => byokFlag(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@/hooks', () => ({
  useAvailableModels: () => ({
    data: modelsData(),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAISettings: () => ({ data: { preferredModel: 'a:bal' } }),
}));
vi.mock('@/stores/agent.store', () => ({
  useAgentStore: (select: (s: unknown) => unknown) =>
    select({ selectedModel: null, setSelectedModel: setSelected }),
}));
vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: (select: (s: unknown) => unknown) =>
    select({ open: openSettings }),
}));

const grantedModels = [
  {
    id: 'a:bal',
    label: 'Balanced One',
    descriptionKey: 'aiModels.sonnet5',
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

describe('CopilotModelPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    byokFlag.mockReturnValue(true);
    modelsData.mockReturnValue(grantedModels);
  });

  it('renders a BYOK-gated model as disabled with the locked badge', async () => {
    modelsData.mockReturnValue(withLockedModel);
    render(<CopilotModelPicker />);

    await userEvent.click(screen.getByRole('button', { name: /Balanced One/ }));

    const locked = screen.getByRole('menuitem', { name: /Premium One/ });
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText('aiAssistant.byok.lockedBadge')
    ).toBeInTheDocument();
  });

  it('selects a granted model', async () => {
    render(<CopilotModelPicker />);

    await userEvent.click(screen.getByRole('button', { name: /Balanced One/ }));
    await userEvent.click(screen.getByText('Fast One'));

    expect(setSelected).toHaveBeenCalledWith('a:fast');
  });

  it('offers a BYOK unlock CTA that opens AI settings when a model is locked', async () => {
    modelsData.mockReturnValue(withLockedModel);
    render(<CopilotModelPicker />);

    await userEvent.click(screen.getByRole('button', { name: /Balanced One/ }));
    await userEvent.click(
      screen.getByRole('button', { name: 'aiAssistant.byok.unlockCta' })
    );

    expect(openSettings).toHaveBeenCalledWith('aiAssistant');
  });

  it('hides the unlock CTA when no model is locked', async () => {
    render(<CopilotModelPicker />);

    await userEvent.click(screen.getByRole('button', { name: /Balanced One/ }));

    expect(
      screen.queryByText('aiAssistant.byok.unlockCta')
    ).not.toBeInTheDocument();
  });

  it('falls back to the account-default hint when key management is unavailable', async () => {
    byokFlag.mockReturnValue(false);
    modelsData.mockReturnValue(withLockedModel);
    render(<CopilotModelPicker />);

    await userEvent.click(screen.getByRole('button', { name: /Balanced One/ }));

    expect(
      screen.queryByText('aiAssistant.byok.unlockCta')
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/aiAssistant.defaultHint: Balanced One/)
    ).toBeInTheDocument();
  });
});
