import { useWorkspaceStore } from '@/stores/workspace.store';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceTabBar } from './WorkspaceTabBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe('WorkspaceTabBar', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ activeTab: 'note' });
  });

  const studyTab = () =>
    screen.getByRole('tab', { name: /workspace.tabs.study/ });

  it('renders note and study tabs', () => {
    render(<WorkspaceTabBar studyCount={2} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('shows the study count on the study tab', () => {
    render(<WorkspaceTabBar studyCount={2} />);
    expect(studyTab()).toHaveTextContent('2');
  });

  it('does not render the count badge when the study count is zero', () => {
    render(<WorkspaceTabBar studyCount={0} />);
    expect(studyTab()).toHaveTextContent('workspace.tabs.study');
    expect(studyTab()).not.toHaveTextContent(/\d/);
  });

  it('marks a tab selected and switches the workspace tab when clicked', async () => {
    render(<WorkspaceTabBar studyCount={2} />);
    await userEvent.click(studyTab());
    expect(studyTab()).toHaveAttribute('aria-selected', 'true');
    expect(useWorkspaceStore.getState().activeTab).toBe('estudio');
  });
});
