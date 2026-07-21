import { useWorkspaceStore } from '@/stores/workspace.store';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceTabBar } from './WorkspaceTabBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@knowtis/data-access-artifacts', () => ({
  useArtifacts: () => ({ data: [{ id: 'a' }, { id: 'b' }] }),
}));

describe('WorkspaceTabBar', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ activeTab: 'note' });
  });

  it('renders note and study tabs', () => {
    render(<WorkspaceTabBar noteId="n1" />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('shows the artifact count on the study tab', () => {
    render(<WorkspaceTabBar noteId="n1" />);
    const studyTab = screen.getByRole('tab', {
      name: /ai.artifacts.studyTools/,
    });
    expect(studyTab).toHaveTextContent('2');
  });

  it('switches the workspace tab when a tab is clicked', async () => {
    render(<WorkspaceTabBar noteId="n1" />);
    await userEvent.click(
      screen.getByRole('tab', { name: /ai.artifacts.studyTools/ })
    );
    expect(useWorkspaceStore.getState().activeTab).toBe('estudio');
  });
});
