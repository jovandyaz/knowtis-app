import { ROUTES } from '@/config';
import { useAgentStore } from '@/stores/agent.store';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SelectableModel } from '@knowtis/shared-types';

import { CopilotModelPicker } from './CopilotModelPicker';

const updatePreferences = vi.fn();
const modelsData = vi.fn();
const modelsPending = vi.fn<() => boolean>();
const modelsError = vi.fn<() => boolean>();
const modelsRefetch = vi.fn();
const modelsEnabled = vi.fn<(enabled?: boolean) => void>();
const prefsEnabled = vi.fn<(enabled?: boolean) => void>();
const prefsData = vi.fn();
const authUser = vi.fn<() => { isAnonymous: boolean } | null>();
const byokFlag = vi.fn<() => boolean>();
const openSettings = vi.fn();
const navigate = vi.fn();
const keysData = vi.fn();
const keysPending = vi.fn<() => boolean>();
const keysEnabled = vi.fn<(enabled?: boolean) => void>();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}));
vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => authUser(),
}));
vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlag: () => byokFlag(),
}));
vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: (selector: (s: { open: typeof openSettings }) => unknown) =>
    selector({ open: openSettings }),
}));
// The real store drags in the agent client; the picker only needs the
// per-conversation effort field, so a real zustand slice keeps it reactive.
vi.mock('@/stores/agent.store', async () => {
  const { create } = await import('zustand');
  interface EffortSlice {
    reasoningEffort: string;
    setReasoningEffort: (effort: string) => void;
  }
  const useAgentStore = create<EffortSlice>((set) => ({
    reasoningEffort: 'auto',
    setReasoningEffort: (effort) => set({ reasoningEffort: effort }),
  }));
  return { useAgentStore };
});
vi.mock('@/hooks', () => ({
  useAvailableModels: (enabled?: boolean) => {
    modelsEnabled(enabled);
    return {
      data: modelsData(),
      isPending: modelsPending(),
      isError: modelsError(),
      refetch: modelsRefetch,
    };
  },
  useAISettings: (enabled?: boolean) => {
    prefsEnabled(enabled);
    return { data: prefsData() };
  },
  useUpdateAISettings: () => ({ mutate: updatePreferences }),
  useProviderKeys: (enabled?: boolean) => {
    keysEnabled(enabled);
    return { data: keysData(), isPending: keysPending() };
  },
}));

// A single user.click batches press+release inside one act(), and jsdom never
// flushes the submenu re-render in between, so Radix's select handler misses
// the click. Splitting the pointer acts restores the selection for sub items.
async function clickSubmenuItem(
  user: ReturnType<typeof userEvent.setup>,
  element: Element
) {
  await user.pointer({ target: element, keys: '[MouseLeft>]' });
  await user.pointer({ target: element, keys: '[/MouseLeft]' });
}

function openMenu(user: ReturnType<typeof userEvent.setup>) {
  return user.click(
    screen.getByRole('button', { name: /aiAssistant\.menu\.triggerLabel/ })
  );
}

const fastModel = {
  id: 'anthropic:haiku-4.5',
  label: 'Haiku 4.5',
  descriptionKey: 'aiModels.haiku45',
  tier: 'fast',
  contextWindow: 200000,
  costClass: 1,
  isDefault: false,
  billedToUser: false,
  routableByServer: true,
  access: 'granted',
  servesIntent: 'fast',
} satisfies SelectableModel;

const balancedModel = {
  id: 'anthropic:sonnet-5',
  label: 'Sonnet 5',
  descriptionKey: 'aiModels.sonnet5',
  tier: 'balanced',
  contextWindow: 1000000,
  costClass: 2,
  isDefault: true,
  billedToUser: false,
  routableByServer: true,
  access: 'granted',
  servesIntent: 'balanced',
  reasoning: { levels: ['low', 'medium', 'high'], mandatory: false },
} satisfies SelectableModel;

const powerfulModel = {
  id: 'anthropic:opus-5',
  label: 'Opus 5',
  descriptionKey: '',
  tier: 'powerful',
  contextWindow: 200000,
  costClass: 3,
  isDefault: false,
  billedToUser: false,
  routableByServer: true,
  access: 'granted',
  servesIntent: 'powerful',
} satisfies SelectableModel;

const openModel = {
  id: 'z-ai:glm-5.3',
  label: 'GLM 5.3',
  descriptionKey: '',
  description: 'Open catalog model',
  tier: 'open',
  contextWindow: 200000,
  costClass: 1,
  isDefault: false,
  billedToUser: false,
  routableByServer: true,
  access: 'granted',
} satisfies SelectableModel;

const byokModel = {
  id: 'openai:gpt-6',
  label: 'GPT-6',
  descriptionKey: '',
  description: 'Frontier on your key',
  tier: 'powerful',
  contextWindow: 400000,
  costClass: 3,
  isDefault: false,
  billedToUser: true,
  routableByServer: true,
  access: 'granted',
} satisfies SelectableModel;

const registeredModels = [
  fastModel,
  balancedModel,
  powerfulModel,
  openModel,
  byokModel,
] satisfies SelectableModel[];

// The balanced default billed to the caller's key, so the effort ladder applies.
const byokListing = [
  fastModel,
  { ...balancedModel, billedToUser: true },
  powerfulModel,
  openModel,
  byokModel,
] satisfies SelectableModel[];
const anthropicKey = [{ provider: 'anthropic', keyPrefix: 'sk-a***' }];

const anonymousModels = [
  { ...fastModel, access: 'requires_account' },
  { ...balancedModel, access: 'granted', isDefault: true },
  { ...powerfulModel, access: 'requires_account' },
] satisfies SelectableModel[];

const { reasoning: _unused, ...balancedWithoutReasoning } = balancedModel;
const anonymousModelsWithoutReasoning = [
  { ...fastModel, access: 'requires_account' },
  { ...balancedWithoutReasoning, access: 'granted', isDefault: true },
  { ...powerfulModel, access: 'requires_account' },
] satisfies SelectableModel[];

describe('CopilotModelPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAgentStore.setState({ reasoningEffort: 'auto' });
    modelsData.mockReturnValue(registeredModels);
    modelsPending.mockReturnValue(false);
    modelsError.mockReturnValue(false);
    prefsData.mockReturnValue({
      preferredModel: null,
      preferredIntent: null,
    });
    authUser.mockReturnValue({ isAnonymous: false });
    byokFlag.mockReturnValue(true);
    keysData.mockReturnValue([]);
    keysPending.mockReturnValue(false);
  });

  it('renders the three intent rows with resolved model names', async () => {
    const user = userEvent.setup();
    render(<CopilotModelPicker />);
    await openMenu(user);

    const rows = screen.getAllByRole('menuitemradio');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Haiku 4.5'),
      expect.stringContaining('Sonnet 5'),
      expect.stringContaining('Opus 5'),
    ]);
    expect(
      screen.getByRole('menuitemradio', { name: /Sonnet 5/ })
    ).toHaveAttribute('aria-checked', 'true');
    // The job line carries the intent semantics, never the model's own copy.
    const haiku = screen.getByRole('menuitemradio', { name: /Haiku 4\.5/ });
    expect(haiku).toHaveTextContent('aiAssistant.intent.fastHint');
    expect(haiku).not.toHaveTextContent('aiModels.haiku45');
    expect(
      screen.getByRole('menuitemradio', { name: /Sonnet 5/ })
    ).toHaveTextContent('aiAssistant.intent.balancedHint');
    expect(
      screen.getByRole('menuitemradio', { name: /Opus 5/ })
    ).toHaveTextContent('aiAssistant.intent.powerfulHint');
    expect(
      screen.queryByText(/aiAssistant\.intent\.(fast|balanced|powerful)$/)
    ).not.toBeInTheDocument();
  });

  it('selecting an intent row clears the model override', async () => {
    const user = userEvent.setup();
    prefsData.mockReturnValue({
      preferredModel: 'openai:gpt-6',
      preferredIntent: null,
    });
    render(<CopilotModelPicker />);

    expect(
      screen.getByRole('button', { name: /aiAssistant\.menu\.triggerLabel/ })
    ).toHaveTextContent('GPT-6');
    await openMenu(user);
    await user.click(screen.getByRole('menuitemradio', { name: /Haiku 4\.5/ }));

    expect(updatePreferences).toHaveBeenCalledWith({
      preferredModel: null,
      preferredIntent: 'fast',
    });
  });

  it('selecting an advanced model stores it as override', async () => {
    const user = userEvent.setup();
    render(<CopilotModelPicker />);

    await openMenu(user);
    await user.click(
      screen.getByRole('menuitem', { name: /aiAssistant\.menu\.moreModels/ })
    );

    expect(
      await screen.findByText('aiAssistant.menu.groupOpen')
    ).toBeInTheDocument();
    expect(screen.getByText('aiAssistant.menu.groupByok')).toBeInTheDocument();
    const row = screen.getByRole('menuitemradio', { name: /GPT-6/ });
    expect(row).toHaveTextContent('aiAssistant.byok.billedBadge');

    await clickSubmenuItem(user, row);

    expect(updatePreferences).toHaveBeenCalledWith({
      preferredModel: 'openai:gpt-6',
    });
  });

  it('anonymous: default row is checked and inert, others lock and route to the CTA', async () => {
    const user = userEvent.setup();
    authUser.mockReturnValue({ isAnonymous: true });
    modelsData.mockReturnValue(anonymousModels);
    render(<CopilotModelPicker />);

    await openMenu(user);

    const defaultRow = screen.getByRole('menuitemradio', { name: /Sonnet 5/ });
    expect(defaultRow).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(1);
    for (const name of [/Haiku 4\.5/, /Opus 5/]) {
      const row = screen.getByRole('menuitem', { name });
      expect(row).toHaveAccessibleName(/aiAssistant\.menu\.lockedHint/);
      expect(row).not.toHaveAttribute('aria-disabled');
    }
    expect(
      screen.getByRole('menuitem', { name: 'aiAssistant.menu.effort' })
    ).toHaveAttribute('aria-disabled', 'true');

    await user.click(defaultRow);
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /Opus 5/ }));
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith({ to: ROUTES.REGISTER });

    await openMenu(user);
    await user.click(
      screen.getByRole('menuitem', { name: 'aiAssistant.menu.registerCta' })
    );
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(keysEnabled).toHaveBeenCalledWith(false);
  });

  it('anonymous: no locked effort row when the default model declares no levels', async () => {
    const user = userEvent.setup();
    authUser.mockReturnValue({ isAnonymous: true });
    modelsData.mockReturnValue(anonymousModelsWithoutReasoning);
    render(<CopilotModelPicker />);

    await openMenu(user);

    expect(
      screen.getByRole('menuitemradio', { name: /Sonnet 5/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/aiAssistant\.menu\.effort/)
    ).not.toBeInTheDocument();
  });

  it('free user picks an effort level and the trigger grows the tail', async () => {
    const user = userEvent.setup();
    render(<CopilotModelPicker />);

    await user.click(
      screen.getByRole('button', { name: /aiAssistant\.menu\.triggerLabel/ })
    );
    await user.click(
      screen.getByRole('menuitem', { name: /aiAssistant\.menu\.effort/ })
    );
    expect(
      await screen.findByText('aiAssistant.menu.effortFootnoteFree')
    ).toBeInTheDocument();
    await clickSubmenuItem(
      user,
      await screen.findByRole('menuitemradio', {
        name: 'aiAssistant.menu.effortLow',
      })
    );

    expect(
      screen.getByRole('button', { name: /aiAssistant\.menu\.triggerLabel/ })
    ).toHaveTextContent('aiAssistant.menu.effortLow');
    expect(useAgentStore.getState().reasoningEffort).toBe('low');
  });

  it('key holder on another provider still gets the ladder of the resolved model', async () => {
    const user = userEvent.setup();
    keysData.mockReturnValue([{ provider: 'openai', keyPrefix: 'sk-o***' }]);
    render(<CopilotModelPicker />);

    await openMenu(user);

    expect(
      screen.getByRole('menuitem', { name: /aiAssistant\.menu\.effort/ })
    ).toBeInTheDocument();
  });

  it('byok user changes effort and the trigger grows the tail', async () => {
    const user = userEvent.setup();
    keysData.mockReturnValue(anthropicKey);
    modelsData.mockReturnValue(byokListing);
    render(<CopilotModelPicker />);

    const trigger = screen.getByRole('button', {
      name: /aiAssistant\.menu\.triggerLabel/,
    });
    expect(trigger).not.toHaveTextContent('aiAssistant.menu.effortHigh');

    await user.click(trigger);
    await user.click(
      screen.getByRole('menuitem', { name: /aiAssistant\.menu\.effort/ })
    );
    expect(
      screen.getByText('aiAssistant.menu.effortFootnote')
    ).toBeInTheDocument();
    await clickSubmenuItem(
      user,
      await screen.findByRole('menuitemradio', {
        name: 'aiAssistant.menu.effortHigh',
      })
    );

    expect(
      screen.getByRole('button', { name: /aiAssistant\.menu\.triggerLabel/ })
    ).toHaveTextContent('aiAssistant.menu.effortHigh');
    expect(useAgentStore.getState().reasoningEffort).toBe('high');
  });

  it('byok user selects an effort level with the keyboard alone', async () => {
    const user = userEvent.setup();
    keysData.mockReturnValue(anthropicKey);
    modelsData.mockReturnValue(byokListing);
    render(<CopilotModelPicker />);

    screen
      .getByRole('button', { name: /aiAssistant\.menu\.triggerLabel/ })
      .focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menuitemradio', { name: /Haiku 4\.5/ });
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(document.activeElement).toHaveTextContent('aiAssistant.menu.effort');
    await user.keyboard('{ArrowRight}');
    await screen.findByRole('menuitemradio', {
      name: 'aiAssistant.menu.effortHigh',
    });
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');

    expect(useAgentStore.getState().reasoningEffort).toBe('high');
  });

  it('collapses a stored effort the newly resolved model does not declare', () => {
    keysData.mockReturnValue(anthropicKey);
    modelsData.mockReturnValue([
      ...byokListing.slice(0, -1),
      { ...byokModel, reasoning: { levels: ['low'], mandatory: false } },
    ]);
    useAgentStore.setState({ reasoningEffort: 'high' });
    const { rerender } = render(<CopilotModelPicker />);
    const trigger = () =>
      screen.getByRole('button', { name: /aiAssistant\.menu\.triggerLabel/ });
    expect(trigger()).toHaveTextContent('aiAssistant.menu.effortHigh');
    expect(useAgentStore.getState().reasoningEffort).toBe('high');

    prefsData.mockReturnValue({
      preferredModel: 'openai:gpt-6',
      preferredIntent: null,
    });
    rerender(<CopilotModelPicker />);

    expect(useAgentStore.getState().reasoningEffort).toBe('auto');
    expect(trigger()).not.toHaveTextContent('aiAssistant.menu.effortHigh');
  });

  it('keeps a stored effort untouched while the model list is still loading', () => {
    keysData.mockReturnValue(anthropicKey);
    modelsData.mockReturnValue(undefined);
    modelsPending.mockReturnValue(true);
    useAgentStore.setState({ reasoningEffort: 'high' });
    render(<CopilotModelPicker />);

    expect(useAgentStore.getState().reasoningEffort).toBe('high');
  });

  it('renders the effort and more-models sections inline below the flyout width', async () => {
    const user = userEvent.setup();
    const width = window.innerWidth;
    window.innerWidth = 390;
    keysData.mockReturnValue(anthropicKey);
    modelsData.mockReturnValue(byokListing);
    try {
      render(<CopilotModelPicker />);
      await openMenu(user);

      const flyoutTriggers = screen
        .queryAllByRole('menuitem')
        .filter((item) => item.hasAttribute('aria-haspopup'));
      expect(flyoutTriggers).toHaveLength(0);
      expect(
        screen.getByRole('menuitemradio', {
          name: 'aiAssistant.menu.effortHigh',
        })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('menuitemradio', { name: /GPT-6/ })
      ).toBeInTheDocument();
      await user.keyboard('{Escape}');

      window.innerWidth = 1024;
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });
      await openMenu(user);
      expect(
        screen
          .getAllByRole('menuitem')
          .filter((item) => item.hasAttribute('aria-haspopup'))
      ).toHaveLength(2);
    } finally {
      window.innerWidth = width;
    }
  });

  it('names the empty state and offers a retry when the list resolves empty', async () => {
    const user = userEvent.setup();
    modelsData.mockReturnValue([]);
    render(<CopilotModelPicker />);

    const trigger = screen.getByRole('button', {
      name: /aiAssistant\.menu\.triggerLabel/,
    });
    expect(trigger).toHaveTextContent('aiAssistant.empty');
    await user.click(trigger);
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('aiAssistant.empty')).toBeInTheDocument();
    expect(within(menu).queryAllByRole('menuitemradio')).toHaveLength(0);
    await user.click(
      screen.getByRole('menuitem', { name: 'aiAssistant.retry' })
    );
    expect(modelsRefetch).toHaveBeenCalledTimes(1);
  });

  it('shows the loading label on a disabled trigger while models resolve', () => {
    modelsData.mockReturnValue(undefined);
    modelsPending.mockReturnValue(true);
    render(<CopilotModelPicker />);

    const trigger = screen.getByRole('button', {
      name: /aiAssistant\.menu\.triggerLabel/,
    });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveTextContent('aiAssistant.loading');
  });

  it('surfaces the load error and retries from the menu', async () => {
    const user = userEvent.setup();
    modelsData.mockReturnValue(undefined);
    modelsError.mockReturnValue(true);
    render(<CopilotModelPicker />);

    await openMenu(user);
    expect(screen.getByText('aiAssistant.loadError')).toBeInTheDocument();
    await user.click(
      screen.getByRole('menuitem', { name: 'aiAssistant.retry' })
    );

    expect(modelsRefetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the BYOK bridge appended after the trigger for a keyless user', async () => {
    const user = userEvent.setup();
    render(<CopilotModelPicker />);

    const bridge = screen.getByRole('button', {
      name: 'aiAssistant.byok.bridge',
    });
    await user.click(bridge);

    expect(openSettings).toHaveBeenCalledWith('aiAssistant', 'aiKeys');
  });
});
