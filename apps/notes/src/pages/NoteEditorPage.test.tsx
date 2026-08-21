import type { ReactElement } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NoteEditorPage } from './NoteEditorPage';

const renderWithClient = (ui: ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
  );

const authUser = vi.fn<() => { isAnonymous: boolean }>();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ noteId: 'note-1' }),
}));

vi.mock('@knowtis/crdt', () => ({
  useYjs: () => ({ getYDoc: () => ({}) }),
  docStateToBase64: () => 'AAA=',
}));
vi.mock('@jovandyaz/auth-react', () => ({
  useAuthUser: () => authUser(),
}));

vi.mock('@/components/organization/NotePropertiesRow', () => ({
  NotePropertiesRow: () => <div data-testid="note-properties-row" />,
}));

const editorRenders: { count: number } = { count: 0 };
let capturedOnUpdate: ((html: string) => void) | undefined;
const updateNoteMutate = vi.fn();

vi.mock('@/components/editor/CollaborativeEditor', () => ({
  CollaborativeEditor: (props: { onUpdate: (html: string) => void }) => {
    editorRenders.count += 1;
    capturedOnUpdate = props.onUpdate;
    return <div data-testid="collaborative-editor" />;
  },
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

vi.mock('@knowtis/data-access-notes', () => ({
  useNote: () => ({
    data: {
      id: 'note-1',
      title: 'My Note',
      content: '<p>hello</p>',
      accessLevel: 'owner',
      bucket: null,
      generalAccess: 'restricted',
      generalAccessPermission: 'viewer',
      shareToken: null,
      editorsCanShare: false,
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
  useUpdateNote: () => ({ mutate: updateNoteMutate, isPending: false }),
  useDeleteNote: () => ({ mutate: vi.fn() }),
  useRestoreNote: () => ({ mutate: vi.fn() }),
}));

describe('NoteEditorPage', () => {
  beforeEach(() => {
    editorRenders.count = 0;
    capturedOnUpdate = undefined;
    updateNoteMutate.mockClear();
    authUser.mockReturnValue({ isAnonymous: false });
  });

  it('renders the editor', () => {
    renderWithClient(<NoteEditorPage />);
    expect(screen.getByTestId('collaborative-editor')).toBeInTheDocument();
  });

  it('offers the organization properties to a signed-up owner', () => {
    renderWithClient(<NoteEditorPage />);
    expect(screen.getByTestId('note-properties-row')).toBeInTheDocument();
  });

  it('hides the organization properties from an anonymous owner', () => {
    authUser.mockReturnValue({ isAnonymous: true });

    renderWithClient(<NoteEditorPage />);

    expect(screen.queryByTestId('note-properties-row')).not.toBeInTheDocument();
  });

  // Autosaved content must carry the doc's own CRDT state — a content write
  // without it lets the server mint a parallel history and duplicate the
  // note on reload (#288).
  it('sends the doc CRDT state with every content autosave', async () => {
    vi.useFakeTimers();
    try {
      renderWithClient(<NoteEditorPage />);
      capturedOnUpdate?.('<p>hello world</p>');
      await vi.runAllTimersAsync();

      expect(updateNoteMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ content: '<p>hello world</p>' }),
          yjsState: 'AAA=',
        }),
        expect.anything()
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not re-render the editor subtree on content keystrokes', () => {
    renderWithClient(<NoteEditorPage />);
    expect(editorRenders.count).toBe(1);

    act(() => {
      capturedOnUpdate?.('<p>hello w</p>');
      capturedOnUpdate?.('<p>hello wo</p>');
      capturedOnUpdate?.('<p>hello world</p>');
    });

    expect(editorRenders.count).toBe(1);
  });
});
