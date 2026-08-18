import { render, screen } from '@testing-library/react';
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
const keysData = vi.fn();
const keysPending = vi.fn<() => boolean>();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
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
  useProviderKeys: () => ({ data: keysData(), isPending: keysPending() }),
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

const intentNamedModel = {
  id: 'fast',
  label: 'Intent Named One',
  descriptionKey: '',
  description: 'Promoted with an id that reads like a style',
  tier: 'fast',
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
const withIntentNamedModel = [...withByokModel, intentNamedModel];

describe('CopilotModelPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modelsData.mockReturnValue(grantedModels);
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

  it('bridges a keyless user to the BYOK settings from the chips', async () => {
    modelsData.mockReturnValue(withLockedModel);
    render(<CopilotModelPicker />);

    const bridge = screen.getByRole('button', {
      name: 'aiAssistant.byok.bridge',
    });
    expect(bridge).toHaveAccessibleDescription('aiAssistant.byok.bridgeHint');

    await userEvent.click(bridge);

    expect(openSettings).toHaveBeenCalledWith('aiAssistant');
  });

  it('offers no bridge while the agent_byok flag is off', () => {
    byokFlag.mockReturnValue(false);
    modelsData.mockReturnValue(withLockedModel);
    render(<CopilotModelPicker />);

    expect(
      screen.queryByRole('button', { name: 'aiAssistant.byok.bridge' })
    ).not.toBeInTheDocument();
  });

  it('offers no bridge once the user already runs on their own key', () => {
    modelsData.mockReturnValue(withByokModel);
    render(<CopilotModelPicker />);

    expect(
      screen.queryByRole('button', { name: 'aiAssistant.byok.bridge' })
    ).not.toBeInTheDocument();
  });

  // Until the list resolves there is no way to know the caller has no key, and
  // a bridge that flashes at someone who already has one is worse than late.
  // "No model billed to you" is not the same as "you hold no key": a stored key
  // unlocks nothing unless a model of that provider is currently wired in, and
  // that caller must not be told again to do what they already did.
  it('offers no bridge to a caller who already stored a key', () => {
    modelsData.mockReturnValue(withLockedModel);
    keysData.mockReturnValue([{ provider: 'google', keyPrefix: 'AIza***' }]);
    render(<CopilotModelPicker />);

    expect(
      screen.queryByRole('button', { name: 'aiAssistant.byok.bridge' })
    ).not.toBeInTheDocument();
  });

  it('offers no bridge until the stored keys resolve', () => {
    modelsData.mockReturnValue(withLockedModel);
    keysData.mockReturnValue(undefined);
    keysPending.mockReturnValue(true);
    render(<CopilotModelPicker />);

    expect(
      screen.queryByRole('button', { name: 'aiAssistant.byok.bridge' })
    ).not.toBeInTheDocument();
  });

  it('offers no bridge until the model list resolves', () => {
    modelsData.mockReturnValue(undefined);
    modelsPending.mockReturnValue(true);
    render(<CopilotModelPicker />);

    expect(
      screen.queryByRole('button', { name: 'aiAssistant.byok.bridge' })
    ).not.toBeInTheDocument();
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
  });

  it('offers one control listing styles above the BYOK models', async () => {
    modelsData.mockReturnValue(withByokModel);
    render(<CopilotModelPicker />);

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    const trigger = screen.getByRole('button');
    expect(trigger).toHaveTextContent('aiAssistant.intent.balanced');
    await userEvent.click(trigger);

    expect(
      screen.getByRole('menuitemradio', { name: /aiAssistant.intent.fast/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemradio', { name: /Byok One/ })
    ).toBeInTheDocument();
    expect(screen.queryByText('Balanced One')).not.toBeInTheDocument();
    expect(screen.queryByText('Premium One')).not.toBeInTheDocument();
  });

  it('groups the models under one heading so no tier repeats a style name', async () => {
    modelsData.mockReturnValue(withByokModel);
    render(<CopilotModelPicker />);

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByText('aiAssistant.modelsGroup')).toBeInTheDocument();
    expect(
      screen.queryAllByText(/^(fast|balanced|powerful|open)$/i)
    ).toHaveLength(0);
  });

  it('returns to the account style when a style row is picked', async () => {
    modelsData.mockReturnValue(withByokModel);
    prefsData.mockReturnValue({
      preferredModel: 'o:byok',
      preferredIntent: null,
    });
    render(<CopilotModelPicker />);

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveTextContent('Byok One');
    await userEvent.click(trigger);
    await userEvent.click(
      screen.getByRole('menuitemradio', { name: /aiAssistant.intent.fast/ })
    );

    expect(updatePreferences).toHaveBeenCalledWith({
      preferredModel: null,
      preferredIntent: 'fast',
    });
  });

  it('persists a picked model as the account preference', async () => {
    modelsData.mockReturnValue(withByokModel);
    render(<CopilotModelPicker />);

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveTextContent('aiAssistant.intent.balanced');
    await userEvent.click(trigger);
    await userEvent.click(screen.getByText('Byok One'));

    expect(updatePreferences).toHaveBeenCalledWith({
      preferredModel: 'o:byok',
    });
  });

  it('stores a model whose id reads like a style as a model, not an intent', async () => {
    modelsData.mockReturnValue(withIntentNamedModel);
    render(<CopilotModelPicker />);

    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByText('Intent Named One'));

    expect(updatePreferences).toHaveBeenCalledWith({
      preferredModel: 'fast',
    });
  });

  it('describes a keyless catalog model with its own text instead of a key echo', async () => {
    modelsData.mockReturnValue(withPromotedModel);
    render(<CopilotModelPicker />);

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveTextContent('aiAssistant.intent.balanced');
    await userEvent.click(trigger);

    expect(
      screen.getByRole('menuitemradio', { name: /Promoted One/ })
    ).toHaveTextContent('Promoted from the open catalog');
    expect(
      screen.getByRole('menuitemradio', { name: /Byok One/ })
    ).toHaveTextContent('aiModels.gpt56');
  });

  it('names the account style when the stored model has left the model list', async () => {
    modelsData.mockReturnValue(withByokModel);
    prefsData.mockReturnValue({
      preferredModel: 'google:gemini-3.5-flash',
      preferredIntent: null,
    });
    render(<CopilotModelPicker />);

    const trigger = screen.getByRole('button');
    expect(trigger).not.toHaveTextContent('—');
    expect(trigger).toHaveTextContent('aiAssistant.intent.balanced');

    await userEvent.click(trigger);
    await userEvent.click(
      screen.getByRole('menuitemradio', { name: /aiAssistant.intent.fast/ })
    );

    expect(updatePreferences).toHaveBeenCalledWith({
      preferredModel: null,
      preferredIntent: 'fast',
    });
  });

  it('names the stored advanced preference on the trigger', () => {
    modelsData.mockReturnValue(withByokModel);
    prefsData.mockReturnValue({
      preferredModel: 'o:byok',
      preferredIntent: 'powerful',
    });
    render(<CopilotModelPicker />);

    expect(screen.getByRole('button')).toHaveTextContent('Byok One');
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('names the stored intent on the trigger when no model outranks it', () => {
    modelsData.mockReturnValue(withByokModel);
    prefsData.mockReturnValue({
      preferredModel: 'a:bal',
      preferredIntent: 'powerful',
    });
    render(<CopilotModelPicker />);

    expect(screen.getByRole('button')).toHaveTextContent(
      'aiAssistant.intent.powerful'
    );
  });

  it('keeps the styles choosable when the model list fails to load', async () => {
    modelsData.mockReturnValue(undefined);
    modelsError.mockReturnValue(true);
    render(<CopilotModelPicker />);

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveTextContent('aiAssistant.intent.balanced');
    await userEvent.click(trigger);
    expect(
      screen.getByRole('menuitemradio', { name: /aiAssistant.intent.powerful/ })
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('menuitem', { name: 'aiAssistant.retry' })
    );
    expect(modelsRefetch).toHaveBeenCalled();
  });

  it('announces the load instead of chips while a stored model is unresolved', async () => {
    modelsData.mockReturnValue(undefined);
    modelsPending.mockReturnValue(true);
    prefsData.mockReturnValue({
      preferredModel: 'o:byok',
      preferredIntent: 'fast',
    });
    render(<CopilotModelPicker />);

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    const trigger = screen.getByRole('button');
    expect(trigger).toHaveTextContent('aiAssistant.loading');
    expect(trigger).toBeEnabled();

    await userEvent.click(trigger);
    await userEvent.click(
      screen.getByRole('menuitemradio', { name: /aiAssistant.intent.powerful/ })
    );

    expect(updatePreferences).toHaveBeenCalledWith({
      preferredModel: null,
      preferredIntent: 'powerful',
    });
  });

  it('keeps the chips while the list loads for a caller with no stored model', () => {
    modelsData.mockReturnValue(undefined);
    modelsPending.mockReturnValue(true);
    render(<CopilotModelPicker />);

    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(
      screen.getByRole('radio', { name: 'aiAssistant.intent.balanced' })
    ).toHaveAttribute('data-state', 'on');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
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
