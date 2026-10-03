import { useAgentStore } from '@/stores/agent.store';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AIPreferences,
  ModelCatalogResponse,
  ModelIntent,
  SelectableModel,
} from '@knowtis/shared-types';

import { CopilotModelPicker } from './CopilotModelPicker';

const { captureProductEvent } = vi.hoisted(() => ({
  captureProductEvent: vi.fn(),
}));
const updatePreferences = vi.fn();
const catalogData = vi.fn<() => ModelCatalogResponse | undefined>();
const catalogPending = vi.fn<() => boolean>();
const catalogError = vi.fn<() => boolean>();
const catalogRefetch = vi.fn();
const catalogRequested = vi.fn();
const prefsData = vi.fn<() => Partial<AIPreferences> | undefined>();
const prefsRequested = vi.fn();
const authUser = vi.fn<() => { isAnonymous: boolean } | null>();
const openSettings = vi.fn();

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
vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => authUser(),
}));
vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: (selector: (s: { open: typeof openSettings }) => unknown) =>
    selector({ open: openSettings }),
}));
vi.mock('@/lib/analytics/product-events', () => ({ captureProductEvent }));
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
vi.mock('@/hooks/useAvailableModels', () => ({
  useAvailableModels: () => {
    catalogRequested();
    return {
      data: catalogData(),
      isPending: catalogPending(),
      isError: catalogError(),
      refetch: catalogRefetch,
    };
  },
}));
vi.mock('@/hooks/useAISettings', () => ({
  useAISettings: () => {
    prefsRequested();
    return { data: prefsData() };
  },
  useUpdateAISettings: () => ({ mutate: updatePreferences }),
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

function trigger() {
  return screen.getByRole('button', {
    name: /aiAssistant\.menu\.triggerLabel/,
  });
}

function openMenu(user: ReturnType<typeof userEvent.setup>) {
  return user.click(trigger());
}

function intentRow(intent: ModelIntent) {
  return screen.getByRole('menuitemradio', {
    name: new RegExp(`^aiAssistant\\.intent\\.${intent}`),
  });
}

async function openAdvanced(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('menuitem', { name: /aiAssistant\.menu\.advanced/ })
  );
  return screen.findByRole('menu', { name: /aiAssistant\.menu\.advanced/ });
}

const REASONING = {
  levels: ['low', 'medium', 'high'],
  mandatory: false,
} satisfies SelectableModel['reasoning'];

function model(
  id: string,
  label: string,
  fields: Partial<SelectableModel> = {}
): SelectableModel {
  return {
    id,
    label,
    descriptionKey: '',
    tier: 'balanced',
    contextWindow: 200000,
    costClass: 2,
    isDefault: false,
    billedToUser: false,
    routableByServer: true,
    ...fields,
  };
}

const FREE: ModelCatalogResponse = {
  tier: 'free',
  models: [
    model('openrouter:minimax/minimax-m2.5', 'MiniMax M2.5', {
      tier: 'fast',
      costClass: 1,
      servesIntent: 'fast',
    }),
    model('openrouter:deepseek/deepseek-v3.2', 'DeepSeek V3.2', {
      isDefault: true,
      servesIntent: 'balanced',
      reasoning: REASONING,
    }),
    model('openrouter:moonshotai/kimi-k2.5', 'Kimi K2.5', {
      tier: 'powerful',
      costClass: 3,
      servesIntent: 'powerful',
    }),
  ],
  intents: [],
};

const byokIntentModels = [
  model('openrouter:anthropic/claude-haiku-4.5', 'Haiku 4.5', {
    tier: 'fast',
    costClass: 1,
    billedToUser: true,
    servesIntent: 'fast',
  }),
  model('anthropic:claude-sonnet-5', 'Sonnet 5', {
    isDefault: true,
    billedToUser: true,
    servesIntent: 'balanced',
    reasoning: REASONING,
  }),
  model('anthropic:claude-opus-5', 'Opus 5', {
    tier: 'powerful',
    costClass: 3,
    billedToUser: true,
    servesIntent: 'powerful',
  }),
];
const gpt6 = model('openai:gpt-6', 'GPT-6', {
  tier: 'powerful',
  costClass: 3,
  billedToUser: true,
});

const BYOK: ModelCatalogResponse = {
  tier: 'byok',
  models: [
    ...byokIntentModels,
    model('openrouter:openai/gpt-5.6-terra', 'GPT-5.6 Terra', {
      billedToUser: true,
    }),
    gpt6,
    model('anthropic:claude-haiku-4-5', 'Haiku 4.5', {
      tier: 'fast',
      costClass: 1,
      billedToUser: true,
      description: 'Fast on your Anthropic key',
    }),
  ],
  intents: [],
};

describe('CopilotModelPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAgentStore.setState({ reasoningEffort: 'auto' });
    catalogData.mockReturnValue(FREE);
    catalogPending.mockReturnValue(false);
    catalogError.mockReturnValue(false);
    prefsData.mockReturnValue({ preferredModel: null, preferredIntent: null });
    authUser.mockReturnValue({ isAnonymous: false });
  });

  it('renders nothing without a session', () => {
    authUser.mockReturnValue(null);

    const { container } = render(<CopilotModelPicker />);

    expect(container).toBeEmptyDOMElement();
  });

  describe('a guest', () => {
    beforeEach(() => {
      authUser.mockReturnValue({ isAnonymous: true });
    });

    it('sees the Balanceado label instead of a picker and loads no catalog', () => {
      render(<CopilotModelPicker />);

      expect(
        screen.getByText('aiAssistant.intent.balanced')
      ).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(catalogRequested).not.toHaveBeenCalled();
      expect(prefsRequested).not.toHaveBeenCalled();
    });

    it('never names an effort level, whatever the conversation holds', () => {
      useAgentStore.setState({ reasoningEffort: 'high' });

      render(<CopilotModelPicker />);

      expect(
        screen.queryByText(/aiAssistant\.menu\.effort/)
      ).not.toBeInTheDocument();
    });
  });

  describe('a free account', () => {
    it('picks among Rápido, Balanceado and Profundo, each naming the model behind it', async () => {
      const user = userEvent.setup();
      render(<CopilotModelPicker />);

      expect(trigger()).toHaveTextContent('aiAssistant.intent.balanced');
      await openMenu(user);

      expect(screen.getAllByRole('menuitemradio')).toHaveLength(3);
      expect(intentRow('fast')).toHaveTextContent(
        'aiAssistant.intent.rowDetail(model=MiniMax M2.5,hint=aiAssistant.intent.fastHint)'
      );
      expect(intentRow('balanced')).toHaveTextContent(
        'aiAssistant.intent.rowDetail(model=DeepSeek V3.2,hint=aiAssistant.intent.balancedHint)'
      );
      expect(intentRow('powerful')).toHaveTextContent(
        'aiAssistant.intent.rowDetail(model=Kimi K2.5,hint=aiAssistant.intent.powerfulHint)'
      );
      expect(intentRow('balanced')).toHaveAttribute('aria-checked', 'true');

      await user.click(intentRow('fast'));

      expect(updatePreferences).toHaveBeenCalledWith({
        preferredModel: null,
        preferredIntent: 'fast',
      });
    });

    it('ends the menu with one entry that opens the API key settings and counts the click', async () => {
      const user = userEvent.setup();
      render(<CopilotModelPicker />);
      await openMenu(user);

      expect(
        screen.queryByRole('menuitem', { name: /aiAssistant\.menu\.advanced/ })
      ).not.toBeInTheDocument();
      const entry = screen.getByRole('menuitem', {
        name: 'aiAssistant.menu.byokCta',
      });
      expect(screen.getAllByRole('menuitem').at(-1)).toBe(entry);

      await user.click(entry);

      expect(openSettings).toHaveBeenCalledWith('aiAssistant', 'aiKeys');
      expect(captureProductEvent).toHaveBeenCalledWith(
        'ai upgrade cta clicked',
        { from_tier: 'free', cta: 'more_models' }
      );
      expect(updatePreferences).not.toHaveBeenCalled();
    });

    it('picks an effort level and the trigger grows the tail', async () => {
      const user = userEvent.setup();
      render(<CopilotModelPicker />);

      await openMenu(user);
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

      expect(trigger()).toHaveTextContent('aiAssistant.menu.effortLow');
      expect(useAgentStore.getState().reasoningEffort).toBe('low');
    });
  });

  describe('a byok account', () => {
    beforeEach(() => {
      catalogData.mockReturnValue(BYOK);
    });

    it('lists its own-key models under Avanzado, one group per provider, and offers no upsell', async () => {
      const user = userEvent.setup();
      render(<CopilotModelPicker />);
      await openMenu(user);

      expect(
        screen.queryByRole('menuitem', { name: 'aiAssistant.menu.byokCta' })
      ).not.toBeInTheDocument();
      const advanced = await openAdvanced(user);

      expect(
        within(advanced)
          .getAllByText(/^(Anthropic|OpenAI|Google|OpenRouter)$/)
          .map((heading) => heading.textContent)
      ).toEqual(['Anthropic', 'OpenAI', 'OpenRouter']);
      const haiku = within(advanced).getAllByRole('menuitemradio', {
        name: /Haiku 4\.5/,
      });
      expect(haiku).toHaveLength(1);
      expect(haiku[0]).toHaveTextContent('aiAssistant.byok.billedBadge');
      expect(
        within(advanced).queryByRole('menuitemradio', { name: /Sonnet 5/ })
      ).not.toBeInTheDocument();
    });

    it('stores an Avanzado model as the override and names it on the trigger', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<CopilotModelPicker />);
      await openMenu(user);
      const advanced = await openAdvanced(user);

      await clickSubmenuItem(
        user,
        within(advanced).getByRole('menuitemradio', { name: /GPT-6/ })
      );
      expect(updatePreferences).toHaveBeenCalledWith({
        preferredModel: 'openai:gpt-6',
      });

      prefsData.mockReturnValue({
        preferredModel: 'openai:gpt-6',
        preferredIntent: null,
      });
      rerender(<CopilotModelPicker />);

      expect(trigger()).toHaveTextContent('GPT-6');
    });

    it('selecting an intent row clears the model override', async () => {
      const user = userEvent.setup();
      prefsData.mockReturnValue({
        preferredModel: 'openai:gpt-6',
        preferredIntent: null,
      });
      render(<CopilotModelPicker />);

      await openMenu(user);
      expect(intentRow('balanced')).toHaveAttribute('aria-checked', 'false');
      await user.click(intentRow('fast'));

      expect(updatePreferences).toHaveBeenCalledWith({
        preferredModel: null,
        preferredIntent: 'fast',
      });
    });

    it('checks the intent row for a stored key model that also serves an intent', async () => {
      const user = userEvent.setup();
      prefsData.mockReturnValue({
        preferredModel: 'anthropic:claude-sonnet-5',
        preferredIntent: 'fast',
      });
      render(<CopilotModelPicker />);

      expect(trigger()).toHaveTextContent('aiAssistant.intent.balanced');
      await openMenu(user);
      expect(intentRow('balanced')).toHaveAttribute('aria-checked', 'true');
      expect(intentRow('fast')).toHaveAttribute('aria-checked', 'false');
    });

    it('changes effort and the trigger grows the tail', async () => {
      const user = userEvent.setup();
      render(<CopilotModelPicker />);
      expect(trigger()).not.toHaveTextContent('aiAssistant.menu.effortHigh');

      await openMenu(user);
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

      expect(trigger()).toHaveTextContent('aiAssistant.menu.effortHigh');
      expect(useAgentStore.getState().reasoningEffort).toBe('high');
    });

    it('selects an effort level with the keyboard alone', async () => {
      const user = userEvent.setup();
      render(<CopilotModelPicker />);

      trigger().focus();
      await user.keyboard('{Enter}');
      await screen.findByRole('menuitemradio', {
        name: /^aiAssistant\.intent\.fast/,
      });
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
      expect(document.activeElement).toHaveTextContent(
        'aiAssistant.menu.effort'
      );
      await user.keyboard('{ArrowRight}');
      await screen.findByRole('menuitemradio', {
        name: 'aiAssistant.menu.effortHigh',
      });
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');

      expect(useAgentStore.getState().reasoningEffort).toBe('high');
    });

    it('collapses a stored effort the newly resolved model does not declare', () => {
      catalogData.mockReturnValue({
        ...BYOK,
        models: [
          ...byokIntentModels,
          { ...gpt6, reasoning: { levels: ['low'], mandatory: false } },
        ],
      });
      useAgentStore.setState({ reasoningEffort: 'high' });
      const { rerender } = render(<CopilotModelPicker />);
      expect(trigger()).toHaveTextContent('aiAssistant.menu.effortHigh');

      prefsData.mockReturnValue({
        preferredModel: 'openai:gpt-6',
        preferredIntent: null,
      });
      rerender(<CopilotModelPicker />);

      expect(useAgentStore.getState().reasoningEffort).toBe('auto');
      expect(trigger()).not.toHaveTextContent('aiAssistant.menu.effortHigh');
    });

    it('renders the effort and Avanzado sections inline below the flyout width', async () => {
      const user = userEvent.setup();
      const width = window.innerWidth;
      window.innerWidth = 390;
      try {
        render(<CopilotModelPicker />);
        await openMenu(user);

        expect(
          screen
            .queryAllByRole('menuitem')
            .filter((item) => item.hasAttribute('aria-haspopup'))
        ).toHaveLength(0);
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
  });

  it('lands a deleted last key on the free default, with the upsell and no Avanzado', async () => {
    const user = userEvent.setup();
    catalogData.mockReturnValue(BYOK);
    prefsData.mockReturnValue({
      preferredModel: 'openai:gpt-6',
      preferredIntent: null,
    });
    const { rerender } = render(<CopilotModelPicker />);
    expect(trigger()).toHaveTextContent('GPT-6');

    catalogData.mockReturnValue(FREE);
    rerender(<CopilotModelPicker />);

    expect(trigger()).toHaveTextContent('aiAssistant.intent.balanced');
    await openMenu(user);
    expect(intentRow('balanced')).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.queryByRole('menuitem', { name: /aiAssistant\.menu\.advanced/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'aiAssistant.menu.byokCta' })
    ).toBeInTheDocument();
  });

  describe('while the catalog loads or fails', () => {
    it('keeps a stored effort untouched while the catalog is still loading', () => {
      catalogData.mockReturnValue(undefined);
      catalogPending.mockReturnValue(true);
      useAgentStore.setState({ reasoningEffort: 'high' });

      render(<CopilotModelPicker />);

      expect(useAgentStore.getState().reasoningEffort).toBe('high');
    });

    it('shows the loading label on a disabled trigger', () => {
      catalogData.mockReturnValue(undefined);
      catalogPending.mockReturnValue(true);

      render(<CopilotModelPicker />);

      expect(trigger()).toBeDisabled();
      expect(trigger()).toHaveTextContent('aiAssistant.loading');
    });

    it('names the empty state and offers a retry when the catalog resolves empty', async () => {
      const user = userEvent.setup();
      catalogData.mockReturnValue({ tier: 'free', models: [], intents: [] });
      render(<CopilotModelPicker />);

      expect(trigger()).toHaveTextContent('aiAssistant.empty');
      await openMenu(user);
      const menu = screen.getByRole('menu');
      expect(within(menu).getByText('aiAssistant.empty')).toBeInTheDocument();
      expect(within(menu).queryAllByRole('menuitemradio')).toHaveLength(0);
      await user.click(
        screen.getByRole('menuitem', { name: 'aiAssistant.retry' })
      );
      expect(catalogRefetch).toHaveBeenCalledTimes(1);
    });

    it('surfaces the load error and retries from the menu', async () => {
      const user = userEvent.setup();
      catalogData.mockReturnValue(undefined);
      catalogError.mockReturnValue(true);
      render(<CopilotModelPicker />);

      await openMenu(user);
      expect(screen.getByText('aiAssistant.loadError')).toBeInTheDocument();
      expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0);
      await user.click(
        screen.getByRole('menuitem', { name: 'aiAssistant.retry' })
      );

      expect(catalogRefetch).toHaveBeenCalledTimes(1);
    });

    it('keeps the cached catalog selectable when a refetch fails', async () => {
      const user = userEvent.setup();
      catalogError.mockReturnValue(true);
      render(<CopilotModelPicker />);

      expect(trigger()).toHaveTextContent('aiAssistant.intent.balanced');
      await openMenu(user);
      expect(screen.getAllByRole('menuitemradio')).toHaveLength(3);
      expect(
        screen.getByRole('menuitem', { name: 'aiAssistant.menu.byokCta' })
      ).toBeInTheDocument();
      expect(screen.getByText('aiAssistant.loadError')).toBeInTheDocument();
      await user.click(
        screen.getByRole('menuitem', { name: 'aiAssistant.retry' })
      );
      expect(catalogRefetch).toHaveBeenCalledTimes(1);

      await openMenu(user);
      await user.click(intentRow('fast'));
      expect(updatePreferences).toHaveBeenCalledWith({
        preferredModel: null,
        preferredIntent: 'fast',
      });
    });
  });
});
