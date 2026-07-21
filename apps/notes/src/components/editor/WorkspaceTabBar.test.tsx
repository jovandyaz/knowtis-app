import { useWorkspaceStore } from '@/stores/workspace.store';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceTabBar } from './WorkspaceTabBar';

const { artifactsMock } = vi.hoisted(() => ({
  artifactsMock: { data: [] as { id: string }[] },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@knowtis/data-access-artifacts', () => ({
  useArtifacts: () => ({ data: artifactsMock.data }),
}));

describe('WorkspaceTabBar', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ activeTab: 'note' });
    artifactsMock.data = [{ id: 'a' }, { id: 'b' }];
  });

  it('renders note and study tabs', () => {
    render(<WorkspaceTabBar noteId="n1" />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('shows the artifact count on the study tab', () => {
    render(<WorkspaceTabBar noteId="n1" />);
    const studyTab = screen.getByRole('tab', {
      name: /workspace.tabs.study/,
    });
    expect(studyTab).toHaveTextContent('2');
  });

  it('does not render the count badge when there are no artifacts', () => {
    artifactsMock.data = [];
    render(<WorkspaceTabBar noteId="n1" />);
    const studyTab = screen.getByRole('tab', {
      name: /workspace.tabs.study/,
    });
    expect(studyTab).toHaveTextContent('workspace.tabs.study');
    expect(studyTab).not.toHaveTextContent(/\d/);
  });

  it('marks a tab selected and switches the workspace tab when clicked', async () => {
    render(<WorkspaceTabBar noteId="n1" />);
    const studyTab = screen.getByRole('tab', {
      name: /workspace.tabs.study/,
    });
    await userEvent.click(studyTab);
    expect(studyTab).toHaveAttribute('aria-selected', 'true');
    expect(useWorkspaceStore.getState().activeTab).toBe('estudio');
  });
});
