import type { ReactElement } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  workspacePanelId,
  workspaceTabId,
} from '@/components/editor/workspace-tab-ids';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NoteEditorPage } from './NoteEditorPage';

const { aiState } = vi.hoisted(() => ({ aiState: { aiEnabled: false } }));

const renderWithClient = (ui: ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
  );

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ noteId: 'note-1' }),
}));

vi.mock('@/stores/ai.store', () => ({
  useAIStore: (selector: (s: { aiEnabled: boolean }) => unknown) =>
    selector({ aiEnabled: aiState.aiEnabled }),
}));

vi.mock('@/components/editor/CollaborativeEditor', () => ({
  CollaborativeEditor: () => <div data-testid="collaborative-editor" />,
}));

vi.mock('@/components/editor/MobileEditorHeader', () => ({
  MobileEditorHeader: () => null,
}));

vi.mock('@/components/editor/NoteControlsPortal', () => ({
  NoteControlsPortal: () => null,
}));

vi.mock('@/components/voice-note/VoiceNoteRecorder', () => ({
  VoiceNoteRecorder: () => null,
}));

vi.mock('@/components/artifacts/StudyToolsTab', () => ({
  StudyToolsTab: () => <div data-testid="study-tools" />,
}));

vi.mock('@knowtis/data-access-artifacts', () => ({
  useArtifacts: () => ({ data: [] }),
}));

vi.mock('@knowtis/data-access-notes', () => ({
  useNote: () => ({
    data: {
      id: 'note-1',
      title: 'My Note',
      content: '<p>hello</p>',
      accessLevel: 'owner',
      generalAccess: 'restricted',
      generalAccessPermission: 'viewer',
      shareToken: null,
      editorsCanShare: false,
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
  useUpdateNote: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteNote: () => ({ mutate: vi.fn() }),
  useRestoreNote: () => ({ mutate: vi.fn() }),
}));

describe('NoteEditorPage workspace tabs', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ activeTab: 'note' });
    aiState.aiEnabled = false;
  });

  describe('when AI is disabled', () => {
    it('keeps the note wrapper plain with no tab semantics', () => {
      renderWithClient(<NoteEditorPage />);

      expect(screen.queryByRole('tablist')).toBeNull();
      expect(screen.queryByRole('tabpanel')).toBeNull();

      const noteWrapper = screen.getByTestId(
        'collaborative-editor'
      ).parentElement;
      expect(noteWrapper).not.toHaveAttribute('role');
      expect(noteWrapper).not.toHaveAttribute('aria-labelledby');
      expect(noteWrapper).not.toHaveAttribute('tabindex');
    });
  });

  describe('when AI is enabled', () => {
    beforeEach(() => {
      aiState.aiEnabled = true;
    });

    it('renders the tab bar and both focusable tabpanels', () => {
      renderWithClient(<NoteEditorPage />);

      expect(screen.getByRole('tablist')).toBeInTheDocument();

      const notePanel = document.getElementById(workspacePanelId('note'));
      const estudioPanel = document.getElementById(workspacePanelId('estudio'));
      expect(notePanel).toBeInTheDocument();
      expect(estudioPanel).toBeInTheDocument();
      expect(notePanel).toHaveAttribute(
        'aria-labelledby',
        workspaceTabId('note')
      );
      expect(estudioPanel).toHaveAttribute(
        'aria-labelledby',
        workspaceTabId('estudio')
      );
      expect(notePanel).toHaveAttribute('tabindex', '0');
      expect(estudioPanel).toHaveAttribute('tabindex', '0');
    });

    it('keeps the editor mounted and only hides the note panel when switching to Estudio', () => {
      renderWithClient(<NoteEditorPage />);

      const editorBefore = screen.getByTestId('collaborative-editor');
      const notePanel = document.getElementById(workspacePanelId('note'));
      const estudioPanel = document.getElementById(workspacePanelId('estudio'));

      expect(notePanel).toBeInTheDocument();
      expect(notePanel).not.toHaveClass('hidden');
      expect(estudioPanel).toHaveClass('hidden');

      act(() => {
        useWorkspaceStore.getState().setTab('estudio');
      });

      expect(document.getElementById(workspacePanelId('note'))).toBe(notePanel);
      expect(screen.getByTestId('collaborative-editor')).toBe(editorBefore);
      expect(notePanel).toBeInTheDocument();
      expect(notePanel).toHaveClass('hidden');

      expect(estudioPanel).not.toHaveClass('hidden');
    });
  });
});
