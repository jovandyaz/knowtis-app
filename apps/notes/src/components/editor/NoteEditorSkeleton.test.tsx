import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NoteEditorSkeleton } from './NoteEditorSkeleton';

const aiEnabled = vi.fn<() => boolean>();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/stores/ai.store', () => ({
  useAIStore: (selector: (s: { aiEnabled: boolean }) => unknown) =>
    selector({ aiEnabled: aiEnabled() }),
}));
vi.mock('@/components/workspace/WorkspaceTabBarSkeleton', () => ({
  WorkspaceTabBarSkeleton: () => (
    <div
      role="status"
      aria-label="workspace.tabsLoading"
      data-testid="workspace-tab-bar-skeleton"
    />
  ),
}));

const tabStrip = () => screen.queryByTestId('workspace-tab-bar-skeleton');

describe('NoteEditorSkeleton', () => {
  beforeEach(() => {
    aiEnabled.mockReturnValue(true);
  });

  it('reserves the workspace tab strip the loaded page renders', () => {
    render(<NoteEditorSkeleton label="editor.loadingNote" />);

    expect(tabStrip()).toBeInTheDocument();
  });

  it('omits the tab strip when AI is off, matching the loaded page', () => {
    aiEnabled.mockReturnValue(false);

    render(<NoteEditorSkeleton label="editor.loadingNote" />);

    expect(tabStrip()).not.toBeInTheDocument();
  });

  it('announces the load once, not once per skeleton', () => {
    render(<NoteEditorSkeleton label="editor.loadingNote" />);

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(
      screen.getByRole('status', { name: 'editor.loadingNote' })
    ).toBeInTheDocument();
  });
});
