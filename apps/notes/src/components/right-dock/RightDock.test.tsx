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
vi.mock('../artifacts/StudyToolsTab', () => ({
  StudyToolsTab: () => <div>study-panel</div>,
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
    useRightDockStore.setState({ isOpen: true, activeTab: 'copilot' });
  });

  it('renders the tabs as a segmented control with two tabs', () => {
    render(<RightDock noteId="n1" />);

    expect(screen.getByRole('tablist')).toBeInTheDocument();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
  });

  it('marks the active tab as selected', () => {
    render(<RightDock noteId="n1" />);

    const activeTab = screen.getByRole('tab', { name: /ai.copilot.tab/ });
    expect(activeTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders the new-conversation action in the dock header on the copilot tab', () => {
    render(<RightDock noteId="n1" />);

    expect(
      screen.getByRole('button', { name: /ai.copilot.newConversation/ })
    ).toBeInTheDocument();
  });
});
