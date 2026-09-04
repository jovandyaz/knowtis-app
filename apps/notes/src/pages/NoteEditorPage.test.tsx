import type { ReactElement } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '@knowtis/api-client';

import { NoteEditorPage } from './NoteEditorPage';

const renderWithClient = (ui: ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
  );

const authUser = vi.fn<() => { isAnonymous: boolean }>();
const { captureProductEvent } = vi.hoisted(() => ({
  captureProductEvent: vi.fn(),
}));

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
vi.mock('@/lib/analytics/product-events', () => ({ captureProductEvent }));

const propertiesRowProps = vi.fn();

vi.mock('@/components/organization/NotePropertiesRow', () => ({
  NotePropertiesRow: (props: { onSuggest?: () => void }) => {
    propertiesRowProps(props);
    return <div data-testid="note-properties-row" />;
  },
}));

const aiEnabled = vi.fn<() => boolean>();
const voiceNotesEnabled = vi.fn<() => boolean>();
const autoOrganizeEnabled = vi.fn<() => boolean>();

vi.mock('@/stores/ai.store', () => ({
  useAIStore: (
    selector: (s: { aiEnabled: boolean; voiceNotesEnabled: boolean }) => unknown
  ) =>
    selector({
      aiEnabled: aiEnabled(),
      voiceNotesEnabled: voiceNotesEnabled(),
    }),
}));
vi.mock('@knowtis/data-access-feature-flags', () => ({
  useFeatureFlag: () => autoOrganizeEnabled(),
}));

const editorRenders: { count: number } = { count: 0 };
let capturedOnUpdate: ((html: string) => void) | undefined;
let capturedOnVoiceNote: (() => void) | undefined;
const updateNoteMutate = vi.fn();

vi.mock('@/components/editor/CollaborativeEditor', () => ({
  CollaborativeEditor: (props: {
    onUpdate: (html: string) => void;
    onVoiceNote?: () => void;
  }) => {
    editorRenders.count += 1;
    capturedOnUpdate = props.onUpdate;
    capturedOnVoiceNote = props.onVoiceNote;
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
  VoiceNoteRecorder: () => <div data-testid="voice-note-recorder" />,
}));

const loadedNote = {
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
};
const noteQuery = vi.fn<() => Record<string, unknown>>();

function loadNote(overrides: Partial<typeof loadedNote.data>) {
  noteQuery.mockReturnValue({
    ...loadedNote,
    data: { ...loadedNote.data, ...overrides },
  });
}

vi.mock('@knowtis/data-access-notes', () => ({
  useNote: () => noteQuery(),
  useUpdateNote: () => ({ mutate: updateNoteMutate, isPending: false }),
  useDeleteNote: () => ({ mutate: vi.fn() }),
  useRestoreNote: () => ({ mutate: vi.fn() }),
  useSuggestOrganization: () => ({
    mutate: vi.fn(),
    isPending: false,
    reset: vi.fn(),
  }),
}));

describe('NoteEditorPage', () => {
  beforeEach(() => {
    editorRenders.count = 0;
    capturedOnUpdate = undefined;
    capturedOnVoiceNote = undefined;
    updateNoteMutate.mockClear();
    captureProductEvent.mockClear();
    propertiesRowProps.mockClear();
    noteQuery.mockReturnValue(loadedNote);
    authUser.mockReturnValue({ isAnonymous: false });
    aiEnabled.mockReturnValue(true);
    voiceNotesEnabled.mockReturnValue(true);
    autoOrganizeEnabled.mockReturnValue(true);
  });

  it('offers the voice note entry points when AI and voice notes are both enabled', () => {
    renderWithClient(<NoteEditorPage />);

    expect(capturedOnVoiceNote).toBeInstanceOf(Function);
    expect(screen.getByTestId('voice-note-recorder')).toBeInTheDocument();
  });

  it('hides the voice note entry points when voice notes are disabled', () => {
    voiceNotesEnabled.mockReturnValue(false);

    renderWithClient(<NoteEditorPage />);

    expect(capturedOnVoiceNote).toBeUndefined();
    expect(screen.queryByTestId('voice-note-recorder')).not.toBeInTheDocument();
  });

  it('hides the voice note entry points when AI is disabled', () => {
    aiEnabled.mockReturnValue(false);

    renderWithClient(<NoteEditorPage />);

    expect(capturedOnVoiceNote).toBeUndefined();
    expect(screen.queryByTestId('voice-note-recorder')).not.toBeInTheDocument();
  });

  it('offers the suggestion affordance when both AI flags are on', () => {
    renderWithClient(<NoteEditorPage />);

    expect(propertiesRowProps.mock.calls[0][0].onSuggest).toBeInstanceOf(
      Function
    );
  });

  it('hides the suggestion affordance when the master AI flag is off', () => {
    aiEnabled.mockReturnValue(false);

    renderWithClient(<NoteEditorPage />);

    expect(propertiesRowProps.mock.calls[0][0].onSuggest).toBeUndefined();
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
  // note on reload.
  it('sends the doc CRDT state with every content autosave', async () => {
    vi.useFakeTimers();
    try {
      renderWithClient(<NoteEditorPage />);
      await act(async () => {
        capturedOnUpdate?.('<p>hello world</p>');
        await vi.runAllTimersAsync();
      });

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

  describe('load errors', () => {
    const failWith = (error: unknown) => {
      noteQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error,
      });
    };

    it('translates a known error code instead of printing the server message', () => {
      failWith(
        new ApiClientError('Permission denied', 403, 'PERMISSION_DENIED')
      );

      renderWithClient(<NoteEditorPage />);

      expect(screen.getByText('editor.permissionDenied')).toBeInTheDocument();
      expect(screen.queryByText('Permission denied')).not.toBeInTheDocument();
    });

    it('translates a not-found code', () => {
      failWith(new ApiClientError('Note abc not found', 404, 'NOTE_NOT_FOUND'));

      renderWithClient(<NoteEditorPage />);

      expect(screen.getByText('editor.notFound')).toBeInTheDocument();
      expect(screen.queryByText('Note abc not found')).not.toBeInTheDocument();
    });

    it('falls back to a generic translated message for an unknown code', () => {
      failWith(new ApiClientError('Something exploded', 500, 'INTERNAL_ERROR'));

      renderWithClient(<NoteEditorPage />);

      expect(screen.getByText('editor.loadErrorGeneric')).toBeInTheDocument();
      expect(screen.queryByText('Something exploded')).not.toBeInTheDocument();
    });

    it('falls back to the generic message for a non-API error', () => {
      failWith(new TypeError('Failed to fetch'));

      renderWithClient(<NoteEditorPage />);

      expect(screen.getByText('editor.loadErrorGeneric')).toBeInTheDocument();
      expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
    });
  });

  it.each(['', '<p></p>', '<p><br></p>', '<p>&nbsp;</p>'])(
    'captures activation once when an initially trivial note (%s) becomes meaningful',
    (initialContent) => {
      loadNote({ content: initialContent });
      renderWithClient(<NoteEditorPage />);

      act(() => capturedOnUpdate?.('<p>First words</p>'));
      act(() => capturedOnUpdate?.('<p>First words and more</p>'));

      expect(captureProductEvent).toHaveBeenCalledTimes(1);
      expect(captureProductEvent).toHaveBeenCalledWith('note activated', {
        source: 'editor',
      });
    }
  );

  it('does not activate an initially populated note', () => {
    renderWithClient(<NoteEditorPage />);

    act(() => capturedOnUpdate?.('<p>Changed words</p>'));

    expect(captureProductEvent).not.toHaveBeenCalled();
  });

  it('does not activate a read-only note', () => {
    loadNote({ content: '', accessLevel: 'viewer' });
    renderWithClient(<NoteEditorPage />);

    act(() => capturedOnUpdate?.('<p>Words</p>'));

    expect(captureProductEvent).not.toHaveBeenCalled();
  });

  it('does not activate while changes remain trivial', () => {
    loadNote({ content: '' });
    renderWithClient(<NoteEditorPage />);

    act(() => capturedOnUpdate?.('<p>&nbsp;</p>'));
    act(() => capturedOnUpdate?.('<p><br></p>'));

    expect(captureProductEvent).not.toHaveBeenCalled();
  });
});
