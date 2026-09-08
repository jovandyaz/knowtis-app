import type { ReactNode } from 'react';

import {
  workspacePanelId,
  workspaceTabId,
} from '@/components/editor/workspace-tab-ids';
import { useWorkspaceStore } from '@/stores/workspace.store';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@knowtis/design-system';
import type { Artifact } from '@knowtis/shared-types';

import { SharedNotePage } from './SharedNotePage';

interface StudyToolsTabProps {
  noteId: string | null;
  artifacts?: Artifact[];
  readOnly?: boolean;
}

const ensureGuestSession = vi.fn<() => Promise<boolean>>();
const toastError = vi.fn();
const {
  captureProductEvent,
  artifactFixtures,
  sharedArtifacts,
  studyToolsProps,
} = vi.hoisted(() => {
  const artifactFixtures = [
    {
      id: 'a1',
      userId: 'u1',
      sourceNoteId: 'note-1',
      title: 'Key ideas',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      type: 'summary',
      content: { summary: 'body', keyPoints: [] },
    },
    {
      id: 'a2',
      userId: 'u1',
      sourceNoteId: 'note-1',
      title: 'Practice quiz',
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
      type: 'quiz',
      content: { questions: [] },
    },
  ] as Artifact[];

  return {
    captureProductEvent: vi.fn(),
    artifactFixtures,
    sharedArtifacts: { data: [] as Artifact[] },
    studyToolsProps: { last: undefined as StudyToolsTabProps | undefined },
  };
});
const authUser = vi.fn<() => { isAnonymous?: boolean } | null>();
const authLoading = vi.fn<() => boolean>();
let denyEdit: (() => void) | undefined;
let token = 'tok';
let noteQuery: {
  data:
    | {
        id: string;
        title: string;
        content: string;
        owner: { name: string };
        updatedAt: string;
        accessLevel: 'viewer' | 'editor';
      }
    | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: ReturnType<typeof vi.fn>;
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ token }),
  Link: ({ children }: { children: ReactNode }) => (
    <a href="/login">{children}</a>
  ),
}));
vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => authUser(),
  useAuthLoading: () => authLoading(),
}));
vi.mock('@/lib/analytics/product-events', () => ({ captureProductEvent }));
vi.mock('@/auth/setup', () => ({
  ensureGuestSession: () => ensureGuestSession(),
}));
vi.mock('sonner', () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() },
}));
vi.mock('@/components/editor/CollaborativeEditor', () => ({
  CollaborativeEditor: ({ onEditDenied }: { onEditDenied?: () => void }) => {
    denyEdit = onEditDenied;
    return <div data-testid="collaborative-editor" />;
  },
}));
vi.mock('@knowtis/editor', () => ({
  ReadOnlyEditor: ({ content }: { content: string }) => (
    <div data-testid="read-only-editor">{content}</div>
  ),
}));
vi.mock('@knowtis/data-access-artifacts', () => ({
  useSharedNoteArtifacts: () => ({ data: sharedArtifacts.data }),
}));
vi.mock('@/components/artifacts/StudyToolsTab', () => ({
  StudyToolsTab: (props: StudyToolsTabProps) => {
    studyToolsProps.last = props;
    return <div data-testid="study-tools-tab" />;
  },
}));
vi.mock('@knowtis/data-access-notes', () => ({
  useNoteByToken: () => noteQuery,
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
);

const renderPage = () => render(<SharedNotePage />, { wrapper });

const clickEdit = () =>
  userEvent.click(
    screen.getAllByRole('button', { name: 'shared.editButton' })[0]
  );

const signInLinks = () =>
  screen.queryAllByRole('link', { name: 'shared.signIn' });

beforeEach(() => {
  vi.clearAllMocks();
  denyEdit = undefined;
  token = 'tok';
  sharedArtifacts.data = [];
  studyToolsProps.last = undefined;
  useWorkspaceStore.setState({ activeTab: 'note' });
  authUser.mockReturnValue({ isAnonymous: true });
  authLoading.mockReturnValue(false);
  noteQuery = {
    data: {
      id: 'note-1',
      title: 'Shared note',
      content: '<p>body</p>',
      owner: { name: 'Owner' },
      updatedAt: '2026-08-14T00:00:00.000Z',
      accessLevel: 'editor',
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
});

describe('SharedNotePage sign-in call to action', () => {
  it('offers sign-in to an anonymous visitor', () => {
    authUser.mockReturnValue({ isAnonymous: true });
    renderPage();
    expect(signInLinks().length).toBeGreaterThan(0);
  });

  it('offers sign-in to a visitor with no session at all', () => {
    authUser.mockReturnValue(null);
    renderPage();
    expect(signInLinks().length).toBeGreaterThan(0);
  });

  it('hides sign-in from a signed-in account', () => {
    authUser.mockReturnValue({ isAnonymous: false });
    renderPage();
    expect(signInLinks()).toHaveLength(0);
  });

  it('hides sign-in from an account whose profile has no isAnonymous flag', () => {
    authUser.mockReturnValue({});
    renderPage();
    expect(signInLinks()).toHaveLength(0);
  });

  it('shows nothing until the session has settled', () => {
    authUser.mockReturnValue({ isAnonymous: false });
    authLoading.mockReturnValue(true);
    renderPage();
    expect(signInLinks()).toHaveLength(0);
  });

  it('offers sign-in on the error screen to an anonymous visitor', () => {
    noteQuery = {
      ...noteQuery,
      data: undefined,
      isError: true,
      error: new Error(),
    };
    renderPage();
    expect(signInLinks()).toHaveLength(1);
  });

  it('hides sign-in on the error screen from a signed-in account', () => {
    authUser.mockReturnValue({ isAnonymous: false });
    noteQuery = {
      ...noteQuery,
      data: undefined,
      isError: true,
      error: new Error(),
    };
    renderPage();
    expect(signInLinks()).toHaveLength(0);
    expect(
      screen.getByRole('link', { name: 'shared.goToKnowtis' })
    ).toBeInTheDocument();
  });
});

describe('SharedNotePage editing as a visitor', () => {
  it.each([
    ['anonymous', true, 'editor'],
    ['registered', false, 'viewer'],
  ] as const)(
    'captures one successful %s shared view',
    async (actorType, isAnonymous, permission) => {
      authUser.mockReturnValue({ isAnonymous });
      if (!noteQuery.data) {
        throw new Error('expected resolved note fixture');
      }
      noteQuery.data = { ...noteQuery.data, accessLevel: permission };
      const { rerender } = render(<SharedNotePage />, { wrapper });

      await waitFor(() =>
        expect(captureProductEvent).toHaveBeenCalledWith('shared note viewed', {
          source: 'share_link',
          permission,
          actor_type: actorType,
        })
      );
      rerender(<SharedNotePage />);
      expect(captureProductEvent).toHaveBeenCalledTimes(1);
    }
  );

  it('attributes a profile without an isAnonymous flag as registered', async () => {
    authUser.mockReturnValue({});
    render(<SharedNotePage />, { wrapper });

    await waitFor(() =>
      expect(captureProductEvent).toHaveBeenCalledWith('shared note viewed', {
        source: 'share_link',
        permission: 'editor',
        actor_type: 'registered',
      })
    );
  });

  it('waits for the auth state before attributing the shared view', async () => {
    authLoading.mockReturnValue(true);
    authUser.mockReturnValue(null);
    const { rerender } = render(<SharedNotePage />, { wrapper });
    expect(captureProductEvent).not.toHaveBeenCalled();

    authLoading.mockReturnValue(false);
    authUser.mockReturnValue({ isAnonymous: false });
    rerender(<SharedNotePage />);

    await waitFor(() =>
      expect(captureProductEvent).toHaveBeenCalledWith('shared note viewed', {
        source: 'share_link',
        permission: 'editor',
        actor_type: 'registered',
      })
    );
    expect(captureProductEvent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['loading', { data: undefined, isLoading: true, isError: false }],
    ['missing data', { data: undefined, isLoading: false, isError: false }],
    [
      'error',
      { data: undefined, isLoading: false, isError: true, error: new Error() },
    ],
  ])('does not capture for %s shared-note state', (_label, state) => {
    noteQuery = { ...noteQuery, ...state };

    render(<SharedNotePage />, { wrapper });

    expect(captureProductEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['loading', { isLoading: true, isError: false }],
    ['error', { isLoading: false, isError: true, error: new Error() }],
  ])(
    'does not capture retained data while the query is %s',
    (_label, state) => {
      noteQuery = { ...noteQuery, ...state };

      render(<SharedNotePage />, { wrapper });

      expect(captureProductEvent).not.toHaveBeenCalled();
    }
  );

  it('gives an account-less visitor an identity before opening the editor', async () => {
    ensureGuestSession.mockResolvedValue(true);
    render(<SharedNotePage />, { wrapper });

    await clickEdit();

    await waitFor(() =>
      expect(screen.getByTestId('collaborative-editor')).toBeInTheDocument()
    );
    expect(ensureGuestSession).toHaveBeenCalledTimes(1);
  });

  it('keeps the note readable and says why when no session can be created', async () => {
    ensureGuestSession.mockResolvedValue(false);
    render(<SharedNotePage />, { wrapper });

    await clickEdit();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('shared.editUnavailable')
    );
    expect(screen.getByTestId('read-only-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('collaborative-editor')).toBeNull();
  });

  it('keeps collaboration mounted and notifies when the server denies editing', async () => {
    ensureGuestSession.mockResolvedValue(true);
    render(<SharedNotePage />, { wrapper });

    await clickEdit();
    await waitFor(() => expect(denyEdit).toBeDefined());
    act(() => denyEdit?.());

    expect(screen.getByTestId('collaborative-editor')).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith('shared.editDenied');
  });
});

describe('SharedNotePage study tab', () => {
  const studyTab = () =>
    screen.getByRole('tab', { name: /workspace.tabs.study/ });
  const notePanel = () => document.getElementById(workspacePanelId('note'));
  const studyPanel = () => document.getElementById(workspacePanelId('estudio'));

  it('leaves the page untabbed when the shared note has no artifacts', () => {
    renderPage();

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tabpanel')).toBeNull();
    expect(screen.getByTestId('read-only-editor')).toBeInTheDocument();
  });

  it('offers a note and a study tab when the shared note has artifacts', () => {
    sharedArtifacts.data = artifactFixtures;
    renderPage();

    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(studyTab()).toHaveTextContent('2');
    expect(notePanel()).toHaveAttribute('role', 'tabpanel');
    expect(notePanel()).toHaveAttribute(
      'aria-labelledby',
      workspaceTabId('note')
    );
    expect(notePanel()).not.toHaveClass('hidden');
    expect(studyPanel()).toHaveClass('hidden');
  });

  it('shows the study tools read-only without unmounting the note', async () => {
    sharedArtifacts.data = artifactFixtures;
    renderPage();

    await userEvent.click(studyTab());

    expect(studyPanel()).not.toHaveClass('hidden');
    expect(studyToolsProps.last).toEqual({
      noteId: 'note-1',
      artifacts: artifactFixtures,
      readOnly: true,
    });
    expect(notePanel()).toHaveClass('hidden');
    expect(screen.getByTestId('read-only-editor')).toBeInTheDocument();
  });

  it('opens on the note tab even when the workspace was left on study', () => {
    sharedArtifacts.data = artifactFixtures;
    useWorkspaceStore.setState({ activeTab: 'estudio' });

    renderPage();

    expect(
      screen.getByRole('tab', { name: /workspace.tabs.note/ })
    ).toHaveAttribute('aria-selected', 'true');
    expect(useWorkspaceStore.getState().activeTab).toBe('note');
  });

  it('no longer offers the study sidebar toggles', () => {
    sharedArtifacts.data = artifactFixtures;
    renderPage();

    expect(
      screen.queryByRole('button', { name: 'ai.artifacts.sidebar.studyTools' })
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'ai.artifacts.sidebar.openPanel' })
    ).toBeNull();
  });
});
