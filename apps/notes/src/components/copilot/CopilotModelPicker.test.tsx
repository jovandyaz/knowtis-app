import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { CopilotModelPicker } from './CopilotModelPicker';

const setSelected = vi.fn();
const openSettings = vi.fn();
const updatePreferences = vi.fn();
const modelsData = vi.fn();
const modelsError = vi.fn<() => boolean>();
const modelsRefetch = vi.fn();
const prefsData = vi.fn();
const sessionModel = vi.fn<() => string | null>();
const authUser = vi.fn<() => { isAnonymous: boolean } | null>();
const featureFlag = vi.fn<(key: string) => boolean>();

vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlag: (key: string) => featureFlag(key),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => authUser(),
}));
vi.mock('@/hooks', () => ({
  useAvailableModels: () => ({
    data: modelsData(),
    isPending: false,
    isError: modelsError(),
    refetch: modelsRefetch,
  }),
  useAISettings: () => ({ data: prefsData() }),
  useUpdateAISettings: () => ({ mutate: updatePreferences }),
}));
vi.mock('@/stores/agent.store', () => ({
  useAgentStore: (select: (s: unknown) => unknown) =>
    select({ selectedModel: sessionModel(), setSelectedModel: setSelected }),
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

describe('CopilotModelPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enableFlags(FEATURE_FLAG_KEYS.AGENT_BYOK);
    modelsData.mockReturnValue(grantedModels);
    modelsError.mockReturnValue(false);
    prefsData.mockReturnValue({
      preferredModel: 'a:bal',
      preferredIntent: null,
    });
    sessionModel.mockReturnValue(null);
    authUser.mockReturnValue({ isAnonymous: false });
  });

  describe('with ai_intent_ux off', () => {
    it('renders a BYOK-gated model as disabled with the locked badge', async () => {
      modelsData.mockReturnValue(withLockedModel);
      render(<CopilotModelPicker />);

      await userEvent.click(
        screen.getByRole('button', { name: /Balanced One/ })
      );

      const locked = screen.getByRole('menuitem', { name: /Premium One/ });
      expect(locked).toHaveAttribute('aria-disabled', 'true');
      expect(
        screen.getByText('aiAssistant.byok.lockedBadge')
      ).toBeInTheDocument();
    });

    it('selects a granted model', async () => {
      render(<CopilotModelPicker />);

      await userEvent.click(
        screen.getByRole('button', { name: /Balanced One/ })
      );
      await userEvent.click(screen.getByText('Fast One'));

      expect(setSelected).toHaveBeenCalledWith('a:fast');
    });

    it('offers a BYOK unlock CTA that opens AI settings when a model is locked', async () => {
      modelsData.mockReturnValue(withLockedModel);
      render(<CopilotModelPicker />);

      await userEvent.click(
        screen.getByRole('button', { name: /Balanced One/ })
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'aiAssistant.byok.unlockCta' })
      );

      expect(openSettings).toHaveBeenCalledWith('aiAssistant');
    });

    it('hides the unlock CTA when no model is locked', async () => {
      render(<CopilotModelPicker />);

      await userEvent.click(
        screen.getByRole('button', { name: /Balanced One/ })
      );

      expect(
        screen.queryByText('aiAssistant.byok.unlockCta')
      ).not.toBeInTheDocument();
    });

    it('falls back to the account-default hint when key management is unavailable', async () => {
      enableFlags();
      modelsData.mockReturnValue(withLockedModel);
      render(<CopilotModelPicker />);

      await userEvent.click(
        screen.getByRole('button', { name: /Balanced One/ })
      );

      expect(
        screen.queryByText('aiAssistant.byok.unlockCta')
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(/aiAssistant.defaultHint: Balanced One/)
      ).toBeInTheDocument();
    });

    it('keeps the full model dropdown for an anonymous user', () => {
      authUser.mockReturnValue({ isAnonymous: true });
      render(<CopilotModelPicker />);

      expect(
        screen.getByRole('button', { name: /Balanced One/ })
      ).toBeInTheDocument();
    });
  });

  describe('with ai_intent_ux on', () => {
    beforeEach(() => {
      enableFlags(FEATURE_FLAG_KEYS.AGENT_BYOK, FEATURE_FLAG_KEYS.AI_INTENT_UX);
      prefsData.mockReturnValue({
        preferredModel: null,
        preferredIntent: null,
      });
    });

    it('offers only the three intent chips to a user without BYOK models', () => {
      modelsData.mockReturnValue(withLockedModel);
      render(<CopilotModelPicker />);

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
      expect(
        screen.queryByText('aiAssistant.byok.lockedBadge')
      ).not.toBeInTheDocument();
    });

    it('activates the default intent when the account has none stored', () => {
      render(<CopilotModelPicker />);

      expect(
        screen.getByRole('radio', { name: 'aiAssistant.intent.balanced' })
      ).toHaveAttribute('data-state', 'on');
    });

    it('drops any model override when an intent chip is picked', async () => {
      render(<CopilotModelPicker />);

      await userEvent.click(
        screen.getByRole('radio', { name: 'aiAssistant.intent.fast' })
      );

      expect(updatePreferences).toHaveBeenCalledWith({
        preferredModel: null,
        preferredIntent: 'fast',
      });
      expect(setSelected).toHaveBeenCalledWith(null);
    });

    it('offers the advanced picker with only BYOK-billed models', async () => {
      modelsData.mockReturnValue(withByokModel);
      render(<CopilotModelPicker />);

      await userEvent.click(
        screen.getByRole('button', { name: /aiAssistant.advanced.trigger/ })
      );

      expect(
        screen.getByRole('menuitem', { name: /Byok One/ })
      ).toBeInTheDocument();
      expect(screen.queryByText('Balanced One')).not.toBeInTheDocument();
      expect(screen.queryByText('Premium One')).not.toBeInTheDocument();
      expect(
        screen.queryByText('aiAssistant.byok.lockedBadge')
      ).not.toBeInTheDocument();
    });

    it('picks an advanced model into the session only', async () => {
      modelsData.mockReturnValue(withByokModel);
      render(<CopilotModelPicker />);

      await userEvent.click(
        screen.getByRole('button', { name: /aiAssistant.advanced.trigger/ })
      );
      await userEvent.click(screen.getByText('Byok One'));

      expect(setSelected).toHaveBeenCalledWith('o:byok');
      expect(updatePreferences).not.toHaveBeenCalled();
    });

    it('deactivates every chip while a model override is in effect', () => {
      sessionModel.mockReturnValue('a:fast');
      render(<CopilotModelPicker />);

      for (const chip of screen.getAllByRole('radio')) {
        expect(chip).toHaveAttribute('data-state', 'off');
      }
    });

    it('keeps the intent chips active over a legacy non-advanced preferredModel', () => {
      modelsData.mockReturnValue(withByokModel);
      prefsData.mockReturnValue({
        preferredModel: 'a:bal',
        preferredIntent: 'powerful',
      });
      render(<CopilotModelPicker />);

      expect(
        screen.getByRole('radio', { name: 'aiAssistant.intent.powerful' })
      ).toHaveAttribute('data-state', 'on');
      expect(
        screen.getByRole('button', { name: /aiAssistant.advanced.trigger/ })
      ).toBeInTheDocument();
    });

    it('deactivates the chips for a stored advanced preference', () => {
      modelsData.mockReturnValue(withByokModel);
      prefsData.mockReturnValue({
        preferredModel: 'o:byok',
        preferredIntent: 'powerful',
      });
      render(<CopilotModelPicker />);

      for (const chip of screen.getAllByRole('radio')) {
        expect(chip).toHaveAttribute('data-state', 'off');
      }
      expect(
        screen.getByRole('button', { name: /Byok One/ })
      ).toBeInTheDocument();
    });

    it('surfaces a model-list load error behind the advanced trigger', async () => {
      modelsData.mockReturnValue(undefined);
      modelsError.mockReturnValue(true);
      prefsData.mockReturnValue({
        preferredModel: null,
        preferredIntent: null,
      });
      render(<CopilotModelPicker />);

      await userEvent.click(
        screen.getByRole('button', { name: 'aiAssistant.loadError' })
      );
      await userEvent.click(
        screen.getByRole('menuitem', { name: 'aiAssistant.retry' })
      );

      expect(modelsRefetch).toHaveBeenCalled();
    });

    it('keeps the chips deselected for a stored preference while the list is unresolved', () => {
      modelsData.mockReturnValue(undefined);
      modelsError.mockReturnValue(true);
      prefsData.mockReturnValue({
        preferredModel: 'o:byok',
        preferredIntent: 'fast',
      });
      render(<CopilotModelPicker />);

      for (const chip of screen.getAllByRole('radio')) {
        expect(chip).toHaveAttribute('data-state', 'off');
      }
    });

    it('clears the override from the advanced footer without touching the intent', async () => {
      modelsData.mockReturnValue(withByokModel);
      sessionModel.mockReturnValue('o:byok');
      render(<CopilotModelPicker />);

      await userEvent.click(screen.getByRole('button', { name: /Byok One/ }));
      await userEvent.click(
        screen.getByRole('button', {
          name: 'aiAssistant.advanced.clearOverride',
        })
      );

      expect(setSelected).toHaveBeenCalledWith(null);
      expect(updatePreferences).toHaveBeenCalledWith({ preferredModel: null });
    });

    it('renders no picker at all for an anonymous user', () => {
      modelsData.mockReturnValue(withByokModel);
      authUser.mockReturnValue({ isAnonymous: true });
      const { container } = render(<CopilotModelPicker />);

      expect(container).toBeEmptyDOMElement();
    });
  });
});
