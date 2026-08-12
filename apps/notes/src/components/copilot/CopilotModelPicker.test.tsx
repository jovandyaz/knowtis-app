import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SelectableModel } from '@knowtis/shared-types';

import { CopilotModelPicker } from './CopilotModelPicker';

const setSelected = vi.fn();
const updatePreferences = vi.fn();
const modelsData = vi.fn();
const modelsError = vi.fn<() => boolean>();
const modelsRefetch = vi.fn();
const modelsEnabled = vi.fn<(enabled?: boolean) => void>();
const prefsEnabled = vi.fn<(enabled?: boolean) => void>();
const prefsData = vi.fn();
const sessionModel = vi.fn<() => string | null>();
const authUser = vi.fn<() => { isAnonymous: boolean } | null>();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => authUser(),
}));
vi.mock('@/hooks', () => ({
  useAvailableModels: (enabled?: boolean) => {
    modelsEnabled(enabled);
    return {
      data: modelsData(),
      isPending: false,
      isError: modelsError(),
      refetch: modelsRefetch,
    };
  },
  useAISettings: (enabled?: boolean) => {
    prefsEnabled(enabled);
    return { data: prefsData() };
  },
  useUpdateAISettings: () => ({ mutate: updatePreferences }),
}));
vi.mock('@/stores/agent.store', () => ({
  useAgentStore: (select: (s: unknown) => unknown) =>
    select({ selectedModel: sessionModel(), setSelectedModel: setSelected }),
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
    routableByServer: true,
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
    routableByServer: true,
    access: 'granted',
  },
] satisfies SelectableModel[];

const lockedModel = {
  id: 'x:premium',
  label: 'Premium One',
  descriptionKey: 'aiModels.gpt56',
  tier: 'powerful',
  contextWindow: 200000,
  costClass: 3,
  isDefault: false,
  billedToUser: false,
  routableByServer: true,
  access: 'requires_byok',
} satisfies SelectableModel;

const byokModel = {
  id: 'o:byok',
  label: 'Byok One',
  descriptionKey: 'aiModels.gpt56',
  tier: 'powerful',
  contextWindow: 200000,
  costClass: 3,
  isDefault: false,
  billedToUser: true,
  routableByServer: true,
  access: 'granted',
} satisfies SelectableModel;

const promotedModel = {
  id: 'o:promoted',
  label: 'Promoted One',
  descriptionKey: '',
  description: 'Promoted from the open catalog',
  tier: 'powerful',
  contextWindow: 200000,
  costClass: 1,
  isDefault: false,
  billedToUser: true,
  routableByServer: true,
  access: 'granted',
} satisfies SelectableModel;

const withLockedModel = [...grantedModels, lockedModel];
const withByokModel = [...grantedModels, lockedModel, byokModel];
const withPromotedModel = [...withByokModel, promotedModel];

describe('CopilotModelPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modelsData.mockReturnValue(grantedModels);
    modelsError.mockReturnValue(false);
    prefsData.mockReturnValue({
      preferredModel: null,
      preferredIntent: null,
    });
    sessionModel.mockReturnValue(null);
    authUser.mockReturnValue({ isAnonymous: false });
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
  });

  it('keeps the chips as the way out of an override with no BYOK models', () => {
    modelsData.mockReturnValue(withLockedModel);
    sessionModel.mockReturnValue('google:gemini-3.5-flash');
    render(<CopilotModelPicker />);

    expect(
      screen.queryByRole('button', { name: /aiAssistant.advanced.trigger/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: 'aiAssistant.intent.fast' })
    ).toBeEnabled();
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

  it('offers one control listing styles above the BYOK models', async () => {
    modelsData.mockReturnValue(withByokModel);
    render(<CopilotModelPicker />);

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    const trigger = screen.getByRole('button', {
      name: 'aiAssistant.intent.label',
    });
    expect(trigger).toHaveTextContent('aiAssistant.intent.balanced');
    await userEvent.click(trigger);

    expect(
      screen.getByRole('menuitem', { name: /aiAssistant.intent.fast/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /Byok One/ })
    ).toBeInTheDocument();
    expect(screen.queryByText('Balanced One')).not.toBeInTheDocument();
    expect(screen.queryByText('Premium One')).not.toBeInTheDocument();
  });

  it('returns to the account style when a style row is picked', async () => {
    modelsData.mockReturnValue(withByokModel);
    sessionModel.mockReturnValue('o:byok');
    render(<CopilotModelPicker />);

    const trigger = screen.getByRole('button', {
      name: 'aiAssistant.intent.label',
    });
    expect(trigger).toHaveTextContent('Byok One');
    await userEvent.click(trigger);
    await userEvent.click(
      screen.getByRole('menuitem', { name: /aiAssistant.intent.fast/ })
    );

    expect(setSelected).toHaveBeenCalledWith(null);
    expect(updatePreferences).toHaveBeenCalledWith({
      preferredModel: null,
      preferredIntent: 'fast',
    });
  });

  it('picks a model into the session only', async () => {
    modelsData.mockReturnValue(withByokModel);
    render(<CopilotModelPicker />);

    await userEvent.click(
      screen.getByRole('button', { name: 'aiAssistant.intent.label' })
    );
    await userEvent.click(screen.getByText('Byok One'));

    expect(setSelected).toHaveBeenCalledWith('o:byok');
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it('describes a keyless catalog model with its own text instead of a key echo', async () => {
    modelsData.mockReturnValue(withPromotedModel);
    render(<CopilotModelPicker />);

    await userEvent.click(
      screen.getByRole('button', { name: 'aiAssistant.intent.label' })
    );

    expect(
      screen.getByRole('menuitem', { name: /Promoted One/ })
    ).toHaveTextContent('Promoted from the open catalog');
    expect(
      screen.getByRole('menuitem', { name: /Byok One/ })
    ).toHaveTextContent('aiModels.gpt56');
  });

  it('names the account style when the session override has left the model list', async () => {
    modelsData.mockReturnValue(withByokModel);
    sessionModel.mockReturnValue('google:gemini-3.5-flash');
    render(<CopilotModelPicker />);

    const trigger = screen.getByRole('button', {
      name: 'aiAssistant.intent.label',
    });
    expect(trigger).not.toHaveTextContent('—');
    expect(trigger).toHaveTextContent('aiAssistant.intent.balanced');

    await userEvent.click(trigger);
    await userEvent.click(
      screen.getByRole('menuitem', { name: /aiAssistant.intent.fast/ })
    );

    expect(setSelected).toHaveBeenCalledWith(null);
    expect(updatePreferences).toHaveBeenCalledWith({
      preferredModel: null,
      preferredIntent: 'fast',
    });
  });

  it('deactivates every chip while a model override is in effect', () => {
    sessionModel.mockReturnValue('a:fast');
    render(<CopilotModelPicker />);

    for (const chip of screen.getAllByRole('radio')) {
      expect(chip).toHaveAttribute('data-state', 'off');
    }
  });

  it('names the stored advanced preference on the trigger', () => {
    modelsData.mockReturnValue(withByokModel);
    prefsData.mockReturnValue({
      preferredModel: 'o:byok',
      preferredIntent: 'powerful',
    });
    render(<CopilotModelPicker />);

    expect(
      screen.getByRole('button', { name: 'aiAssistant.intent.label' })
    ).toHaveTextContent('Byok One');
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('names the stored intent on the trigger when no model outranks it', () => {
    modelsData.mockReturnValue(withByokModel);
    prefsData.mockReturnValue({
      preferredModel: 'a:bal',
      preferredIntent: 'powerful',
    });
    render(<CopilotModelPicker />);

    expect(
      screen.getByRole('button', { name: 'aiAssistant.intent.label' })
    ).toHaveTextContent('aiAssistant.intent.powerful');
  });

  it('keeps the styles choosable when the model list fails to load', async () => {
    modelsData.mockReturnValue(undefined);
    modelsError.mockReturnValue(true);
    render(<CopilotModelPicker />);

    await userEvent.click(
      screen.getByRole('button', { name: 'aiAssistant.intent.label' })
    );
    expect(
      screen.getByRole('menuitem', { name: /aiAssistant.intent.powerful/ })
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('menuitem', { name: 'aiAssistant.retry' })
    );
    expect(modelsRefetch).toHaveBeenCalled();
  });

  it('keeps the chips deselected while the model list is still loading', () => {
    modelsData.mockReturnValue(undefined);
    modelsError.mockReturnValue(false);
    prefsData.mockReturnValue({
      preferredModel: 'o:byok',
      preferredIntent: 'fast',
    });
    render(<CopilotModelPicker />);

    const chips = screen.getAllByRole('radio');
    expect(chips).toHaveLength(3);
    for (const chip of chips) {
      expect(chip).toHaveAttribute('data-state', 'off');
    }
  });

  it('renders no picker at all for an anonymous user', () => {
    modelsData.mockReturnValue(withByokModel);
    authUser.mockReturnValue({ isAnonymous: true });
    const { container } = render(<CopilotModelPicker />);

    expect(container).toBeEmptyDOMElement();
  });

  it('never queries models or preferences for an anonymous user', () => {
    authUser.mockReturnValue({ isAnonymous: true });
    render(<CopilotModelPicker />);

    expect(modelsEnabled).toHaveBeenCalledWith(false);
    expect(prefsEnabled).toHaveBeenCalledWith(false);
  });

  it('queries models and preferences for a signed-in user', () => {
    render(<CopilotModelPicker />);

    expect(modelsEnabled).toHaveBeenCalledWith(true);
    expect(prefsEnabled).toHaveBeenCalledWith(true);
  });

  it('waits for the session before querying anything', () => {
    modelsData.mockReturnValue(withByokModel);
    authUser.mockReturnValue(null);
    const { container } = render(<CopilotModelPicker />);

    expect(container).toBeEmptyDOMElement();
    expect(modelsEnabled).toHaveBeenCalledWith(false);
    expect(prefsEnabled).toHaveBeenCalledWith(false);
  });
});
