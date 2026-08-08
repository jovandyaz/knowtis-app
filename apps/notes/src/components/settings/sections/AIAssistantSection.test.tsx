import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { AIAssistantSection } from './AIAssistantSection';

const update = vi.fn();
const openSettings = vi.fn();
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
  AIKeysManager: () => <div>byok-keys-manager</div>,
}));
vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: (select: (s: unknown) => unknown) =>
    select({ open: openSettings }),
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
    enableFlags();
    modelsData.mockReturnValue(grantedModels);
    modelsError.mockReturnValue(false);
    prefsData.mockReturnValue({
      preferredModel: 'a:bal',
      preferredIntent: null,
    });
  });

  describe('with ai_intent_ux off', () => {
    it('updates the default model on select', async () => {
      render(<AIAssistantSection />);
      await userEvent.click(
        screen.getByRole('button', { name: /Balanced One/ })
      );
      await userEvent.click(screen.getByText('Fast One'));
      expect(update).toHaveBeenCalledWith({ preferredModel: 'a:fast' });
    });

    it('renders a BYOK-gated model as disabled with the locked badge', async () => {
      modelsData.mockReturnValue(withLockedModel);
      render(<AIAssistantSection />);
      await userEvent.click(
        screen.getByRole('button', { name: /Balanced One/ })
      );

      const locked = screen.getByRole('menuitem', { name: /Premium One/ });
      expect(locked).toHaveAttribute('aria-disabled', 'true');
      expect(
        screen.getByText('aiAssistant.byok.lockedBadge')
      ).toBeInTheDocument();
    });

    it('offers a BYOK unlock CTA that opens AI settings when a model is locked', async () => {
      enableFlags(FEATURE_FLAG_KEYS.AGENT_BYOK);
      modelsData.mockReturnValue(withLockedModel);
      render(<AIAssistantSection />);
      await userEvent.click(
        screen.getByRole('button', { name: /Balanced One/ })
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'aiAssistant.byok.unlockCta' })
      );
      expect(openSettings).toHaveBeenCalledWith('aiAssistant');
    });

    it('hides the unlock CTA when no model is locked', async () => {
      enableFlags(FEATURE_FLAG_KEYS.AGENT_BYOK);
      render(<AIAssistantSection />);
      await userEvent.click(
        screen.getByRole('button', { name: /Balanced One/ })
      );
      expect(
        screen.queryByText('aiAssistant.byok.unlockCta')
      ).not.toBeInTheDocument();
    });

    it('hides the unlock CTA when key management is unavailable, keeping the locked badge', async () => {
      modelsData.mockReturnValue(withLockedModel);
      render(<AIAssistantSection />);
      await userEvent.click(
        screen.getByRole('button', { name: /Balanced One/ })
      );
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
      enableFlags(FEATURE_FLAG_KEYS.AGENT_BYOK);
      render(<AIAssistantSection />);
      expect(screen.getByText('byok-keys-manager')).toBeInTheDocument();
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
      expect(
        screen.queryByText('aiAssistant.byok.lockedBadge')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('aiAssistant.byok.unlockCta')
      ).not.toBeInTheDocument();
    });

    it('keeps the keys manager reachable so a free user can add a BYOK key', () => {
      modelsData.mockReturnValue(withLockedModel);
      render(<AIAssistantSection />);

      expect(screen.getByText('byok-keys-manager')).toBeInTheDocument();
    });

    it('renders the chips without the keys manager when key management is off', () => {
      enableFlags(FEATURE_FLAG_KEYS.AI_INTENT_UX);
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
      expect(
        screen.queryByRole('button', {
          name: 'aiAssistant.advanced.clearOverride',
        })
      ).not.toBeInTheDocument();
    });

    it('surfaces a model-list load error behind the advanced trigger', async () => {
      modelsData.mockReturnValue(undefined);
      modelsError.mockReturnValue(true);
      render(<AIAssistantSection />);

      await userEvent.click(
        screen.getByRole('button', { name: /aiAssistant.loadError/ })
      );
      await userEvent.click(screen.getByText('aiAssistant.retry'));

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
      expect(
        screen.queryByText('aiAssistant.byok.lockedBadge')
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

    it('clears the override from the advanced footer without touching the intent', async () => {
      modelsData.mockReturnValue(withByokModel);
      prefsData.mockReturnValue({
        preferredModel: 'o:byok',
        preferredIntent: 'fast',
      });
      render(<AIAssistantSection />);

      await userEvent.click(screen.getByRole('button', { name: /Byok One/ }));
      await userEvent.click(
        screen.getByRole('button', {
          name: 'aiAssistant.advanced.clearOverride',
        })
      );

      expect(update).toHaveBeenCalledWith({ preferredModel: null });
    });
  });
});
