import { useRightDockStore } from '@/stores/right-dock.store';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RightDock } from './RightDock';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@knowtis/shared-hooks', () => ({ useMediaQuery: () => true }));
vi.mock('../copilot', () => ({
  AgentCopilotPanel: () => <div>copilot-panel</div>,
}));
vi.mock('@/stores/agent.store', () => ({
  useAgentStore: (selector: (state: unknown) => unknown) =>
    selector({
      newConversation: vi.fn(),
      messages: [{ id: 'm1', role: 'user', content: 'hi' }],
    }),
}));

describe('RightDock', () => {
  beforeEach(() => {
    useRightDockStore.setState({ isOpen: true });
  });

  it('renders only the copilot panel', () => {
    render(<RightDock />);
    expect(screen.getByText('copilot-panel')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('renders the new-conversation action', () => {
    render(<RightDock />);
    expect(
      screen.getByRole('button', { name: /ai.copilot.newConversation/ })
    ).toBeInTheDocument();
  });
});
