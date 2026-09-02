import type { ReactNode } from 'react';

import { useAgentStore } from '@/stores/agent.store';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SelectableModel } from '@knowtis/shared-types';

import { AgentCopilotPanel } from './AgentCopilotPanel';

const authUser = vi.fn<() => { isAnonymous: boolean } | null>();
const byokFlag = vi.fn<() => boolean>();
const modelsData = vi.fn();
const prefsData = vi.fn();
const keysData = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@jovandyaz/auth-react', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAuthUser: () => authUser(),
}));
vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlag: () => byokFlag(),
}));
vi.mock('@/hooks', () => ({
  useAvailableModels: () => ({ data: modelsData() }),
  useAISettings: () => ({ data: prefsData() }),
  useProviderKeys: () => ({ data: keysData(), isPending: false }),
}));
vi.mock('./CopilotModelPicker', () => ({
  CopilotModelPicker: () => null,
}));
vi.mock('./AgentMessageList', () => ({
  AgentMessageList: () => <div data-testid="messages" />,
}));
vi.mock('./AgentEmptyState', () => ({
  AgentEmptyState: () => <div data-testid="empty" />,
}));
vi.mock('./AgentComposer', () => ({
  AgentComposer: ({
    modelPicker,
    onSend,
  }: {
    modelPicker?: ReactNode;
    onSend: (text: string) => void;
  }) => (
    <div data-testid="composer">
      {modelPicker}
      <button data-testid="composer-send" onClick={() => onSend('hola')}>
        send
      </button>
    </div>
  ),
}));

const reasoningModel = {
  id: 'anthropic:sonnet-5',
  label: 'Sonnet 5',
  descriptionKey: '',
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

const { reasoning: _unused, ...plainModel } = reasoningModel;

const realSendMessage = useAgentStore.getState().sendMessage;

const pill = () => screen.getByRole('button', { name: 'aiAssistant.think' });
const pillOrNull = () =>
  screen.queryByRole('button', { name: 'aiAssistant.think' });

describe('AgentCopilotPanel think pill', () => {
  beforeEach(() => {
    useAgentStore.setState({
      status: 'idle',
      error: null,
      answeredError: null,
      messages: [],
      sendMessage: realSendMessage,
    });
    authUser.mockReturnValue({ isAnonymous: false });
    byokFlag.mockReturnValue(true);
    modelsData.mockReturnValue([reasoningModel]);
    prefsData.mockReturnValue({ preferredModel: null, preferredIntent: null });
    keysData.mockReturnValue([]);
  });

  it('shows a toggleable pill for a free registered user on a reasoning model', async () => {
    const user = userEvent.setup();
    render(<AgentCopilotPanel />);

    expect(pill()).toHaveAttribute('aria-pressed', 'false');

    await user.click(pill());

    expect(pill()).toHaveAttribute('aria-pressed', 'true');
  });

  it('hides the pill when the resolved model lacks reasoning', () => {
    modelsData.mockReturnValue([plainModel]);
    render(<AgentCopilotPanel />);

    expect(pillOrNull()).not.toBeInTheDocument();
  });

  it('shows the pill for the override entry when it reasons', () => {
    modelsData.mockReturnValue([
      plainModel,
      { ...reasoningModel, id: 'z-ai:glm-5.3', servesIntent: undefined },
    ]);
    prefsData.mockReturnValue({
      preferredModel: 'z-ai:glm-5.3',
      preferredIntent: null,
    });
    render(<AgentCopilotPanel />);

    expect(pill()).toBeInTheDocument();
  });

  it('hides the pill when the resolved model runs on the user key', () => {
    keysData.mockReturnValue([{ provider: 'anthropic', keyPrefix: 'sk-a***' }]);
    modelsData.mockReturnValue([{ ...reasoningModel, billedToUser: true }]);
    render(<AgentCopilotPanel />);

    expect(pillOrNull()).not.toBeInTheDocument();
  });

  it('keeps the pill when the key covers another provider than the resolved model', () => {
    keysData.mockReturnValue([{ provider: 'openai', keyPrefix: 'sk-o***' }]);
    modelsData.mockReturnValue([reasoningModel]);
    render(<AgentCopilotPanel />);

    expect(pill()).toBeInTheDocument();
  });

  it('hides the pill for anonymous visitors', () => {
    authUser.mockReturnValue({ isAnonymous: true });
    render(<AgentCopilotPanel />);

    expect(pillOrNull()).not.toBeInTheDocument();
  });

  it('boosted send carries high effort once and resets the pill', async () => {
    const user = userEvent.setup();
    const sendSpy = vi.fn();
    useAgentStore.setState({ sendMessage: sendSpy });
    render(<AgentCopilotPanel />);

    await user.click(pill());
    await user.click(screen.getByTestId('composer-send'));

    expect(sendSpy).toHaveBeenCalledWith('hola', undefined, {
      effort: 'high',
    });
    expect(pill()).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByTestId('composer-send'));

    expect(sendSpy).toHaveBeenLastCalledWith('hola', undefined, undefined);
  });
});
